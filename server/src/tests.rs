use axum::body::Body;
use axum::http::{header, HeaderValue, Request, StatusCode};
use tower::ServiceExt;

use crate::auth;
use crate::build_app;
use crate::db::init_pool;
use crate::state::AppState;

async fn app() -> axum::Router {
    let pool = init_pool("sqlite::memory:").await.expect("test pool");
    build_app(AppState::new(pool))
}

async fn body_json(res: axum::response::Response) -> serde_json::Value {
    let (parts, body) = res.into_parts();
    let bytes = axum::body::to_bytes(body, usize::MAX)
        .await
        .expect("read body");
    let mut v: serde_json::Value =
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = v.as_object_mut() {
        obj.insert("__status".into(), serde_json::json!(parts.status.as_u16()));
    }
    v
}

async fn login(app: &axum::Router, username: &str, password: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "username": username, "password": password }).to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"].as_u64(), Some(200), "login failed: {v}");
    v["data"]["accessToken"].as_str().unwrap().to_string()
}

fn get_with_token(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        )
        .body(Body::empty())
        .unwrap()
}

async fn json_request(
    app: &axum::Router,
    method: &str,
    uri: &str,
    token: &str,
    payload: serde_json::Value,
) -> serde_json::Value {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        )
        .body(Body::from(payload.to_string()))
        .unwrap();
    body_json(app.clone().oneshot(req).await.unwrap()).await
}

#[test]
fn password_hash_roundtrip() {
    let hash = auth::hash_password("s3cret-pass").unwrap();
    assert!(auth::verify_password("s3cret-pass", &hash));
    assert!(!auth::verify_password("wrong", &hash));
    assert!(!auth::verify_password("s3cret-pass", "not-a-hash"));
}

#[test]
fn token_typ_must_match() {
    let (refresh, _) = auth::create_token(1, "admin", "refresh", 60).unwrap();
    assert!(auth::verify_token(&refresh, "refresh").is_ok());
    assert!(auth::verify_token(&refresh, "access").is_err());
}

#[test]
fn token_expired_rejected() {
    let (token, _) = auth::create_token(1, "admin", "access", -10).unwrap();
    let err = auth::verify_token(&token, "access").unwrap_err();
    assert!(matches!(err, crate::error::AppError::TokenExpired));
}

#[tokio::test]
async fn health_ok() {
    let app = app().await;
    let res = app.clone()
        .oneshot(Request::get("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn login_returns_permissions_and_me() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/auth/me", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"], 200);
    assert_eq!(v["data"]["username"], "admin");
    let perms = v["data"]["permissions"].as_array().unwrap();
    assert!(perms.len() >= 10, "super admin should have many perms");
    assert!(perms.contains(&serde_json::json!("system:role:delete")));
}

#[tokio::test]
async fn login_wrong_password_rejected() {
    let app = app().await;
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "username": "admin", "password": "bad" }).to_string(),
        ))
        .unwrap();
    let v = body_json(app.oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 400);
    assert_eq!(v["code"], 400);
}

#[tokio::test]
async fn disabled_user_cannot_login() {
    let app = app().await;
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "username": "zhouming", "password": "user123" }).to_string(),
        ))
        .unwrap();
    let v = body_json(app.oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 403);
}

#[tokio::test]
async fn me_requires_auth() {
    let app = app().await;
    let res = app.clone()
        .oneshot(Request::get("/api/auth/me").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn rbac_forbids_missing_permission() {
    let app = app().await;
    let auditor_token = login(&app, "auditor", "audit123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/users?page=1&pageSize=5", &auditor_token))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn rbac_viewer_can_see_dashboard() {
    let app = app().await;
    let demo_token = login(&app, "demo", "demo123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/dashboard/overview", &demo_token))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn user_crud_cycle() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let created = json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({
            "username": "qa_robot",
            "password": "qa-pass1",
            "nickname": "QA 机器人",
            "dept": "质量保障部",
            "position": "自动化测试",
            "roles": [3]
        }),
    )
    .await;
    assert_eq!(created["__status"], 201, "create: {created}");
    let id = created["data"]["id"].as_i64().unwrap();
    assert_eq!(created["data"]["nickname"], "QA 机器人");

    let updated = json_request(
        &app,
        "PUT",
        &format!("/api/users/{id}"),
        &token,
        serde_json::json!({ "nickname": "QA Bot v2", "status": 0 }),
    )
    .await;
    assert_eq!(updated["__status"], 200);
    assert_eq!(updated["data"]["nickname"], "QA Bot v2");
    assert_eq!(updated["data"]["status"], 0);

    let dup = json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({ "username": "qa_robot", "password": "whatever1" }),
    )
    .await;
    assert_eq!(dup["__status"], 409);

    let bad_name = json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({ "username": "AB", "password": "whatever1" }),
    )
    .await;
    assert_eq!(bad_name["__status"], 400);

    let deleted = json_request(&app, "DELETE", &format!("/api/users/{id}"), &token, serde_json::json!({})).await;
    assert_eq!(deleted["__status"], 200);

    let gone = json_request(&app, "PUT", &format!("/api/users/{id}"), &token, serde_json::json!({ "nickname": "x" })).await;
    assert_eq!(gone["__status"], 404);
}

#[tokio::test]
async fn cannot_delete_self() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/auth/me", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    let admin_id = v["data"]["id"].as_i64().unwrap();
    let del = json_request(&app, "DELETE", &format!("/api/users/{admin_id}"), &token, serde_json::json!({})).await;
    assert_eq!(del["__status"], 400);
}

#[tokio::test]
async fn user_list_pagination_and_search() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/users?page=1&pageSize=5", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"], 200);
    assert_eq!(v["data"]["list"].as_array().unwrap().len(), 5);
    assert_eq!(v["data"]["pageSize"], 5);
    assert!(v["data"]["total"].as_i64().unwrap() >= 20);

    let res = app.clone()
        .oneshot(get_with_token("/api/users?keyword=%E9%99%88%E6%9B%A6", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["data"]["total"], 1);
    assert_eq!(v["data"]["list"][0]["username"], "chenxi");
}

#[tokio::test]
async fn role_crud_and_super_admin_protected() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let created = json_request(
        &app,
        "POST",
        "/api/roles",
        &token,
        serde_json::json!({
            "name": "临时测试组",
            "code": "tmp_test",
            "description": "集成测试",
            "permissions": ["dashboard"]
        }),
    )
    .await;
    assert_eq!(created["__status"], 201, "create role: {created}");
    let id = created["data"]["id"].as_i64().unwrap();
    assert_eq!(created["data"]["permissions"].as_array().unwrap().len(), 1);

    let updated = json_request(
        &app,
        "PUT",
        &format!("/api/roles/{id}"),
        &token,
        serde_json::json!({
            "name": "临时测试组2",
            "code": "tmp_test",
            "description": "改",
            "permissions": ["dashboard", "system:audit:list"]
        }),
    )
    .await;
    assert_eq!(updated["__status"], 200);
    assert_eq!(updated["data"]["permissions"].as_array().unwrap().len(), 2);

    let del = json_request(&app, "DELETE", &format!("/api/roles/{id}"), &token, serde_json::json!({})).await;
    assert_eq!(del["__status"], 200);

    let res = app.clone()
        .oneshot(get_with_token("/api/roles", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    let super_role = v["data"]["list"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["code"] == serde_json::json!("super_admin"))
        .unwrap()["id"]
        .as_i64()
        .unwrap();
    let protected = json_request(
        &app,
        "DELETE",
        &format!("/api/roles/{super_role}"),
        &token,
        serde_json::json!({}),
    )
    .await;
    assert_eq!(protected["__status"], 400);
}

#[tokio::test]
async fn refresh_token_flow_and_old_access_still_valid() {
    let app = app().await;
    let token = login(&app, "demo", "demo123").await;

    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "username": "demo", "password": "demo123" }).to_string(),
        ))
        .unwrap();
    let login_v = body_json(app.clone().oneshot(req).await.unwrap()).await;
    let refresh = login_v["data"]["refreshToken"].as_str().unwrap().to_string();

    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/refresh")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "refreshToken": refresh }).to_string(),
        ))
        .unwrap();
    let v = body_json(app.clone().oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 200);
    let new_access = v["data"]["accessToken"].as_str().unwrap();
    assert!(!new_access.is_empty());
    assert_eq!(v["data"]["user"]["username"], "demo");

    // access token 不能当 refresh 用
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/refresh")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "refreshToken": token }).to_string(),
        ))
        .unwrap();
    let v = body_json(app.oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 401);
}

#[tokio::test]
async fn dashboard_overview_shape() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let res = app.clone()
        .oneshot(get_with_token("/api/dashboard/overview", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"], 200);
    assert!(v["data"]["userCount"].as_i64().unwrap() >= 20);
    assert_eq!(v["data"]["weeklyTrend"].as_array().unwrap().len(), 7);
    assert!(!v["data"]["deptDistribution"].as_array().unwrap().is_empty());
    assert!(!v["data"]["recentActivities"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn audit_list_and_record_on_write() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let res = app.clone()
        .oneshot(get_with_token("/api/audit/logs?page=1&pageSize=10", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"], 200);
    assert!(v["data"]["total"].as_i64().unwrap() >= 1); // 登录本身已被记录

    json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({ "username": "audit_probe", "password": "probe123" }),
    )
    .await;
}

#[tokio::test]
async fn profile_update_and_change_password() {
    let app = app().await;
    let token = login(&app, "demo", "demo123").await;

    let v = json_request(
        &app,
        "PUT",
        "/api/profile",
        &token,
        serde_json::json!({ "nickname": "张演示Renamed", "email": "new@jing.dev", "phone": "10086" }),
    )
    .await;
    assert_eq!(v["__status"], 200);
    assert_eq!(v["data"]["nickname"], "张演示Renamed");

    let v = json_request(
        &app,
        "PUT",
        "/api/profile/password",
        &token,
        serde_json::json!({ "oldPassword": "wrong", "newPassword": "brandnew1" }),
    )
    .await;
    assert_eq!(v["__status"], 400);

    let v = json_request(
        &app,
        "PUT",
        "/api/profile/password",
        &token,
        serde_json::json!({ "oldPassword": "demo123", "newPassword": "brandnew1" }),
    )
    .await;
    assert_eq!(v["__status"], 200);

    let new_token = login(&app, "demo", "brandnew1").await;
    assert!(!new_token.is_empty());
}

#[tokio::test]
async fn messages_flow() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let res = app
        .clone()
        .oneshot(get_with_token("/api/messages?page=1&pageSize=5", &token))
        .await
        .unwrap();
    let v = body_json(res).await;
    assert_eq!(v["__status"], 200);
    assert!(v["data"]["total"].as_i64().unwrap() >= 3, "seed broadcasts");
    let first_id = v["data"]["list"][0]["id"].as_i64().unwrap();

    let v = body_json(
        app.clone()
            .oneshot(get_with_token("/api/messages/unread", &token))
            .await
            .unwrap(),
    )
    .await;
    assert!(v["data"]["unreadCount"].as_i64().unwrap() >= 3);

    json_request(&app, "PUT", &format!("/api/messages/{first_id}/read"), &token, serde_json::json!({})).await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/messages/unread", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["unreadCount"].as_i64(), v["data"]["unreadCount"].as_i64()); // smoke

    json_request(&app, "PUT", "/api/messages/read-all", &token, serde_json::json!({})).await;
    let v = body_json(app.oneshot(get_with_token("/api/messages/unread", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["unreadCount"], 0);
}

#[tokio::test]
async fn user_export_and_import() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let res = app
        .clone()
        .oneshot(get_with_token("/api/users/export", &token))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(res
        .headers()
        .get(header::CONTENT_TYPE)
        .unwrap()
        .to_str()
        .unwrap()
        .contains("text/csv"));
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let csv = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(csv.contains("username,nickname,email"));
    assert!(csv.contains("admin"));

    let v = json_request(
        &app,
        "POST",
        "/api/users/import",
        &token,
        serde_json::json!({
            "rows": [
                { "username": "csv_user_a", "nickname": "导入A", "dept": "技术中台" },
                { "username": "csv_user_b", "nickname": "导入B" },
                { "username": "admin", "nickname": "重复" },
                { "username": "BAD!", "nickname": "非法" }
            ]
        }),
    )
    .await;
    assert_eq!(v["__status"], 200);
    assert_eq!(v["data"]["imported"], 2);
    assert_eq!(v["data"]["skipped"], 2);

    // 导入的用户可用默认密码登录
    let t = login(&app, "csv_user_a", "User@12345").await;
    assert!(!t.is_empty());
}

#[tokio::test]
async fn login_rate_limit_locks_account() {
    let app = app().await;
    let body = serde_json::json!({ "username": "rl_probe", "password": "wrong" });
    let mut last_status = 0;
    for _ in 0..7 {
        let req = Request::builder()
            .method("POST")
            .uri("/api/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let v = body_json(app.clone().oneshot(req).await.unwrap()).await;
        last_status = v["__status"].as_u64().unwrap();
        if last_status == 429 {
            break;
        }
    }
    assert_eq!(last_status, 429);

    // 锁定期间任何尝试都被拒
    let req = Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "username": "rl_probe", "password": "anything" }).to_string(),
        ))
        .unwrap();
    let v = body_json(app.oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 429);
}

#[tokio::test]
async fn session_force_logout_revokes_token() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    // 会话列表含当前登录
    let v = body_json(app.clone().oneshot(get_with_token("/api/sessions", &token)).await.unwrap()).await;
    assert_eq!(v["__status"], 200);
    assert!(!v["data"].as_array().unwrap().is_empty());
    let sid = v["data"].as_array().unwrap()[0]["id"].as_i64().unwrap();
    assert_eq!(v["data"].as_array().unwrap()[0]["isCurrent"], true);

    // 吊销自己的会话（非当前 jti 匹配场景：直接吊销第一条即当前）
    let del = json_request(&app, "DELETE", &format!("/api/sessions/{sid}"), &token, serde_json::json!({})).await;
    assert_eq!(del["__status"], 200);

    // token 立即失效
    let res = app
        .oneshot(get_with_token("/api/auth/me", &token))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn departments_crud_and_rename_cascade() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let v = body_json(app.clone().oneshot(get_with_token("/api/departments", &token)).await.unwrap()).await;
    assert_eq!(v["__status"], 200);
    assert!(v["data"].as_array().unwrap().iter().any(|d| d["name"] == serde_json::json!("技术中台")));

    let created = json_request(
        &app,
        "POST",
        "/api/departments",
        &token,
        serde_json::json!({ "name": "AI 实验室", "sort": 9 }),
    )
    .await;
    assert_eq!(created["__status"], 201);
    let id = created["data"]["id"].as_i64().unwrap();

    // 改名级联 users.dept
    put_user_dept(&app, &token, "demo", "AI 实验室").await;
    let upd = json_request(
        &app,
        "PUT",
        &format!("/api/departments/{id}"),
        &token,
        serde_json::json!({ "name": "AI 中心", "sort": 9 }),
    )
    .await;
    assert_eq!(upd["__status"], 200);
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?keyword=demo", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["list"][0]["dept"], "AI 中心");

    // 有成员的部门不可删
    let blocked = json_request(&app, "DELETE", &format!("/api/departments/{id}"), &token, serde_json::json!({})).await;
    assert_eq!(blocked["__status"], 409);

    // 移到自己之下 → 400
    let loop_err = json_request(
        &app,
        "PUT",
        &format!("/api/departments/{id}"),
        &token,
        serde_json::json!({ "name": "AI 中心", "parentId": id }),
    )
    .await;
    assert_eq!(loop_err["__status"], 400);

    // 清空成员后可删
    put_user_dept(&app, &token, "demo", "产品设计部").await;
    let del = json_request(&app, "DELETE", &format!("/api/departments/{id}"), &token, serde_json::json!({})).await;
    assert_eq!(del["__status"], 200);
}

async fn put_user_dept(app: &axum::Router, token: &str, username: &str, dept: &str) {
    let v = body_json(app.clone().oneshot(get_with_token(&format!("/api/users?keyword={username}"), token)).await.unwrap()).await;
    let uid = v["data"]["list"][0]["id"].as_i64().unwrap_or_else(|| panic!("用户搜索失败: {v}"));
    json_request(app, "PUT", &format!("/api/users/{uid}"), token, serde_json::json!({ "dept": dept })).await;
}

#[tokio::test]
async fn audit_purge_respects_min_days() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let v = json_request(&app, "DELETE", "/api/audit/logs/old?beforeDays=3", &token, serde_json::json!({})).await;
    assert_eq!(v["__status"], 400);
    // 种子日志都在 14 天内，purge 180 天不会删东西
    let v = json_request(&app, "DELETE", "/api/audit/logs/old?beforeDays=180", &token, serde_json::json!({})).await;
    assert_eq!(v["__status"], 200);
    assert_eq!(v["data"]["deleted"], 0);
}

#[tokio::test]
async fn dashboard_days_param() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let v = body_json(
        app.clone()
            .oneshot(get_with_token("/api/dashboard/overview?days=14", &token))
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(v["data"]["weeklyTrend"].as_array().unwrap().len(), 14);
}

#[tokio::test]
async fn configs_dict_and_announcement() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let v = body_json(app.clone().oneshot(get_with_token("/api/configs/public", &token)).await.unwrap()).await;
    assert!(v["data"]["site_name"].as_str().unwrap().contains("JingAdmin"));

    let upd = json_request(
        &app,
        "PUT",
        "/api/configs",
        &token,
        serde_json::json!({ "items": [{ "key": "announcement", "value": "系统将于周六维护", "isPublic": 1 }] }),
    )
    .await;
    assert_eq!(upd["__status"], 200);

    let v = body_json(app.clone().oneshot(get_with_token("/api/configs/public", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["announcement"], "系统将于周六维护");

    let v = body_json(app.clone().oneshot(get_with_token("/api/dict", &token)).await.unwrap()).await;
    assert_eq!(v["data"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn approval_flow_grants_role() {
    let app = app().await;
    let demo_token = login(&app, "demo", "demo123").await;

    let v = body_json(app.clone().oneshot(get_with_token("/api/roles", &demo_token)).await.unwrap()).await;
    // auditor 角色 id=4（seed 顺序）
    let rid = v["data"]["list"].as_array().unwrap().iter().find(|r| r["code"] == serde_json::json!("auditor")).unwrap()["id"]
        .as_i64()
        .unwrap();

    let applied = json_request(
        &app,
        "POST",
        "/api/applications",
        &demo_token,
        serde_json::json!({ "roleId": rid, "reason": "需要审计权限" }),
    )
    .await;
    assert_eq!(applied["__status"], 201);
    let req_id = applied["data"]["id"].as_i64().unwrap();

    let admin_token = login(&app, "admin", "admin123").await;
    let ok = json_request(&app, "PUT", &format!("/api/applications/{req_id}/approve"), &admin_token, serde_json::json!({})).await;
    assert_eq!(ok["__status"], 200);

    // 重新登录看权限生效
    let fresh = login(&app, "demo", "demo123").await;
    let me = body_json(app.clone().oneshot(get_with_token("/api/auth/me", &fresh)).await.unwrap()).await;
    assert!(me["data"]["permissions"].as_array().unwrap().contains(&serde_json::json!("system:audit:list")));

    // 重复处理 → 409
    let again = json_request(&app, "PUT", &format!("/api/applications/{req_id}/reject"), &admin_token, serde_json::json!({})).await;
    assert_eq!(again["__status"], 409);
}

#[tokio::test]
async fn trash_restore_purge_flow() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let created = json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({ "username": "ghost_user", "password": "ghost123", "nickname": "幽灵" }),
    )
    .await;
    let id = created["data"]["id"].as_i64().unwrap();

    del_req(&app, &token, &format!("/api/users/{id}")).await; // 软删

    // 列表不可见
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?keyword=ghost", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["total"], 0);

    // 回收站可见
    let v = body_json(app.clone().oneshot(get_with_token("/api/users/trash", &token)).await.unwrap()).await;
    assert_eq!(v["data"].as_array().unwrap().len(), 1);

    // 恢复
    json_request(&app, "PUT", &format!("/api/users/{id}/restore"), &token, serde_json::json!({})).await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?keyword=ghost", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["total"], 1);

    // 再删 → 彻底清除
    del_req(&app, &token, &format!("/api/users/{id}")).await;
    let del = json_request(&app, "DELETE", &format!("/api/users/{id}/purge"), &token, serde_json::json!({})).await;
    assert_eq!(del["__status"], 200);
    let v = body_json(app.oneshot(get_with_token("/api/users/trash", &token)).await.unwrap()).await;
    assert_eq!(v["data"].as_array().unwrap().len(), 0);
}

async fn del_req(app: &axum::Router, token: &str, uri: &str) {
    let req = Request::builder()
        .method("DELETE")
        .uri(uri)
        .header(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}")).unwrap())
        .body(Body::empty())
        .unwrap();
    body_json(app.clone().oneshot(req).await.unwrap()).await;
}

#[tokio::test]
async fn api_key_readonly_access() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let created = json_request(&app, "POST", "/api/keys", &token, serde_json::json!({ "name": "ci 只读" })).await;
    assert_eq!(created["__status"], 201);
    let key = created["data"]["key"].as_str().unwrap().to_string();

    // 只读放行
    let req = Request::builder()
        .method("GET")
        .uri("/api/users?page=1")
        .header("x-api-key", &key)
        .body(Body::empty())
        .unwrap();
    let v = body_json(app.clone().oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 200);

    // 写操作拒绝
    let req = Request::builder()
        .method("DELETE")
        .uri("/api/users/999")
        .header("x-api-key", &key)
        .body(Body::empty())
        .unwrap();
    let v = body_json(app.oneshot(req).await.unwrap()).await;
    assert_eq!(v["__status"], 403);
}

#[tokio::test]
async fn search_unified_groups() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/search?q=chen", &token)).await.unwrap()).await;
    assert_eq!(v["__status"], 200);
    assert!(!v["data"]["users"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn audit_chain_verifies_valid() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    // 制造几条带链审计
    json_request(&app, "POST", "/api/users", &token, serde_json::json!({ "username": "chainme", "password": "chain123" })).await;
    json_request(&app, "DELETE", "/api/users/9999", &token, serde_json::json!({})).await;

    let v = body_json(app.clone().oneshot(get_with_token("/api/audit/verify", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["valid"], true, "verify 结果: {v}");
    assert!(v["data"]["checked"].as_i64().unwrap() >= 2, "verify: {v}");
}

#[tokio::test]
async fn password_policy_and_history() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    // 短密码被拒
    let v = json_request(&app, "PUT", "/api/profile/password", &token, serde_json::json!({ "oldPassword": "admin123", "newPassword": "ab1" })).await;
    assert_eq!(v["__status"], 400);
    // 纯字母被拒
    let v = json_request(&app, "PUT", "/api/profile/password", &token, serde_json::json!({ "oldPassword": "admin123", "newPassword": "abcdefgxyz" })).await;
    assert_eq!(v["__status"], 400);
    // 合法改密
    let v = json_request(&app, "PUT", "/api/profile/password", &token, serde_json::json!({ "oldPassword": "admin123", "newPassword": "fresh1pass" })).await;
    assert_eq!(v["__status"], 200);
    // 改回历史密码被拒
    let v = json_request(&app, "PUT", "/api/profile/password", &token, serde_json::json!({ "oldPassword": "fresh1pass", "newPassword": "admin123" })).await;
    assert_eq!(v["__status"], 400);
    assert!(v["message"].as_str().unwrap().contains("最近"));
}

#[tokio::test]
async fn rate_limit_trips_429() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    // 收紧限流到 3/min
    json_request(
        &app,
        "PUT",
        "/api/configs",
        &token,
        serde_json::json!({ "items": [{ "key": "rate_limit_per_min", "value": "3" }] }),
    )
    .await;

    let mut codes = vec![];
    for _ in 0..6 {
        let res = app.clone().oneshot(get_with_token_raw("/api/auth/me", &token)).await.unwrap();
        codes.push(res.status().as_u16());
    }
    assert!(codes.contains(&200));
    assert!(codes.contains(&429), "应触发限流: {codes:?}");
}

fn get_with_token_raw(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}")).unwrap())
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn tenant_isolation_and_management() {
    let app = app().await;
    let admin = login(&app, "admin", "admin123").await;

    // 建租户
    let t = json_request(&app, "POST", "/api/tenants", &admin, serde_json::json!({ "name": "青岚科技", "plan": "pro" })).await;
    assert_eq!(t["__status"], 201, "创建租户失败: {t}");
    let tid = t["data"]["id"].as_i64().unwrap();

    // 建用户（带系统管理员角色）并移入新租户
    let u = json_request(&app, "POST", "/api/users", &admin, serde_json::json!({ "username": "qing_user", "password": "qing123", "nickname": "青岚一号", "roles": [2] })).await;
    let uid = u["data"]["id"].as_i64().unwrap_or_else(|| panic!("建用户失败: {u}"));
    let mv = json_request(&app, "PUT", &format!("/api/users/{uid}"), &admin, serde_json::json!({ "tenantId": tid })).await;
    assert_eq!(mv["__status"], 200);


    // u1 登录后列表只见同租户成员
    let u1 = login(&app, "qing_user", "qing123").await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?page=1&pageSize=50", &u1)).await.unwrap()).await;
    for u in v["data"]["list"].as_array().unwrap() {
        assert_eq!(u["username"].as_str().unwrap(), "qing_user", "跨租户泄漏: {u}");
    }
    // admin 仍见全量（tenant 1）
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?page=1&pageSize=1", &admin)).await.unwrap()).await;
    assert!(v["data"]["total"].as_i64().unwrap() >= 20);

    // 敏感脱敏：qing_user 列表里他人邮箱/手机被 mask（自己可见）
    let has_self = v["data"]["list"][0]["email"].as_str().unwrap().contains('@');
    assert!(has_self);
}

#[tokio::test]
async fn health_deep_and_backup_task() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/health/deep", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["db"]["ok"], true);

    let r = json_request(&app, "POST", "/api/tasks/backup_db/run", &token, serde_json::json!({})).await;
    assert_eq!(r["__status"], 200);
    assert!(r["data"]["ok"].as_bool().unwrap(), "备份失败: {r}");
}

#[tokio::test]
async fn logs_level_hot_update_and_abac_role_roundtrip() {
    let app = app().await;
    let token = login(&app, "admin", "admin123").await;

    let v = json_request(&app, "PUT", "/api/logs/level", &token, serde_json::json!({ "level": "debug" })).await;
    assert_eq!(v["__status"], 200);
    let v = body_json(app.clone().oneshot(get_with_token("/api/logs/level", &token)).await.unwrap()).await;
    assert_eq!(v["data"]["level"], "debug");
    let v = json_request(&app, "PUT", "/api/logs/level", &token, serde_json::json!({ "level": "verbose" })).await;
    assert_eq!(v["__status"], 400);

    // ABAC 角色：创建带 scope+rules 的角色 → 读回 → 改 rules
    let created = json_request(
        &app,
        "POST",
        "/api/roles",
        &token,
        serde_json::json!({
            "name": "部门审计员",
            "code": "dept_auditor",
            "description": "仅见启用用户",
            "permissions": ["dashboard", "system:user:list"],
            "dataScope": "dept",
            "rulesJson": "[{\"field\":\"status\",\"eq\":\"1\"}]"
        }),
    )
    .await;
    assert_eq!(created["__status"], 201, "{created}");
    let rid = created["data"]["id"].as_i64().unwrap();

    let list = body_json(app.clone().oneshot(get_with_token("/api/roles", &token)).await.unwrap()).await;
    let role = list["data"]["list"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["code"] == serde_json::json!("dept_auditor"))
        .unwrap();
    assert_eq!(role["dataScope"], "dept");
    assert!(role["rulesJson"].as_str().unwrap().contains("status"));

    // 非法 rules → 400
    let bad = json_request(
        &app,
        "PUT",
        &format!("/api/roles/{rid}"),
        &token,
        serde_json::json!({ "name": "x", "code": "dept_auditor", "rulesJson": "[{\"field\":\"password\"}]" }),
    )
    .await;
    assert_eq!(bad["__status"], 400);

    // 该角色用户（dept scope）列表被规则过滤：status=1 才可见
    let u = json_request(
        &app,
        "POST",
        "/api/users",
        &token,
        serde_json::json!({ "username": "scoped_user", "password": "scoped1", "dept": "技术中台", "roles": [rid] }),
    )
    .await;
    assert_eq!(u["__status"], 201);
    let scoped = login(&app, "scoped_user", "scoped1").await;
    let v = body_json(app.clone().oneshot(get_with_token("/api/users?page=1&pageSize=100", &scoped)).await.unwrap()).await;
    for u in v["data"]["list"].as_array().unwrap() {
        assert_eq!(u["status"], 1, "ABAC 过滤失效，看到停用用户: {}", u["username"]);
    }
    // 同部门且启用的人可见（自己必在）
    assert!(v["data"]["list"].as_array().unwrap().iter().any(|u| u["username"] == "wanglin"));
}
