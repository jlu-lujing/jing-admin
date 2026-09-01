use axum::http::request::Parts;

use crate::models::{AuditOut, PageData, PageQuery};
use crate::state::AppState;
use crate::auth::AuthUser;
use crate::error::{AppJson, ApiResponse};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

/// 记录一条审计日志（静默失败，不影响主流程）
pub async fn record(
    state: &AppState,
    user_id: Option<i64>,
    username: &str,
    action: &str,
    detail: &str,
    raw: &Parts,
    status_code: u16,
) {
    let method = raw.method.to_string();
    let path = raw.uri.path().to_string();
    let ip = raw
        .headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .or_else(|| {
            raw.headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "127.0.0.1".into());
    let ua = raw
        .headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    crate::security::audit_insert(&state.db, user_id, username, action, detail, &method, &path, status_code as i64, &ip, &ua).await;
}

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PageQuery>,
) -> AppJson<PageData<AuditOut>> {
    user.require("system:audit:list")?;
    let (offset, limit) = q.offset_limit();
    let keyword = q.keyword.unwrap_or_default();

    let where_sql = " WHERE (?1 = '' OR a.username LIKE '%'||?1||'%' OR a.action LIKE '%'||?1||'%' OR a.detail LIKE '%'||?1||'%' OR a.path LIKE '%'||?1||'%')";

    let total: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM audit_logs a{where_sql}"))
        .bind(&keyword)
        .fetch_one(&state.db)
        .await?;

    let rows = sqlx::query(&format!(
        "SELECT a.* FROM audit_logs a{where_sql} ORDER BY a.id DESC LIMIT ?2 OFFSET ?3"
    ))
    .bind(&keyword)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let list: Vec<AuditOut> = rows
        .iter()
        .map(|r| AuditOut {
            id: r.try_get("id").unwrap_or_default(),
            username: r.try_get("username").unwrap_or_default(),
            action: r.try_get("action").unwrap_or_default(),
            detail: r.try_get("detail").unwrap_or_default(),
            method: r.try_get("method").unwrap_or_default(),
            path: r.try_get("path").unwrap_or_default(),
            status_code: r.try_get("status_code").unwrap_or_default(),
            ip: r.try_get("ip").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(PageData { list, total, page: (offset / limit) + 1, page_size: limit }),
        }),
    ))
}

pub async fn purge(
    State(state): State<AppState>,
    user: AuthUser,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, i64>>,
) -> AppJson<serde_json::Value> {
    user.require("system:audit:list")?;
    let days = *q.get("beforeDays").unwrap_or(&0);
    if days < 7 {
        return Err(crate::error::AppError::BadRequest("beforeDays 至少为 7".into()));
    }
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
    let result = sqlx::query("DELETE FROM audit_logs WHERE created_at < ?")
        .bind(cutoff.to_rfc3339())
        .execute(&state.db)
        .await?;
    let deleted = result.rows_affected() as i64;
    tracing::info!("审计清理: 删除 {deleted} 条（>{days} 天前）");
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(serde_json::json!({ "deleted": deleted })),
        }),
    ))
}

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

pub fn noun_of(path: &str) -> &'static str {
    match path.split('/').nth(2).unwrap_or("") {
        "users" => "用户",
        "roles" => "角色",
        "departments" => "部门",
        "configs" => "配置",
        "dict" => "字典",
        "files" => "文件",
        "sessions" => "会话",
        "messages" => "消息",
        "keys" => "API密钥",
        "applications" => "权限申请",
        "tasks" => "任务",
        "profile" => "个人资料",
        "totp" => "两步验证",
        _ => "",
    }
}

/// 全局写操作审计 + 指标观察中间件
pub async fn write_log(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let auth_hdr = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".into());

    let t0 = std::time::Instant::now();
    let res = next.run(req).await;
    let status = res.status().as_u16();
    crate::metrics::observe(status, &path);
    crate::metrics::observe_latency(t0.elapsed().as_millis() as u64);

    let is_write = matches!(
        method,
        axum::http::Method::POST | axum::http::Method::PUT | axum::http::Method::DELETE | axum::http::Method::PATCH
    );
    let skip = path.starts_with("/api/auth/login")
        || path.starts_with("/api/auth/refresh")
        || path.starts_with("/api/ws");
    if is_write && path.starts_with("/api/") && !skip {
        let mut uid = None;
        let mut uname = "anonymous".to_string();
        if let Some(tok) = auth_hdr.strip_prefix("Bearer ") {
            if let Ok(c) = crate::auth::verify_token(tok, "access") {
                uid = Some(c.sub);
                uname = c.username;
            }
        }
        let verb = match method {
            axum::http::Method::POST => "新增",
            axum::http::Method::PUT => "更新",
            axum::http::Method::DELETE => "删除",
            _ => "操作",
        };
        let noun = noun_of(&path);
        let action = format!("{verb}{noun}");
        let detail = format!("{method} {path}");
        record_raw(&state, uid, &uname, &action, &detail, &ip, "", status).await;
    }
    res
}

/// 无 Parts 版记录（中间件专用）
pub async fn record_raw(
    state: &AppState,
    user_id: Option<i64>,
    username: &str,
    action: &str,
    detail: &str,
    ip: &str,
    user_agent: &str,
    status_code: u16,
) {
    crate::security::audit_insert(&state.db, user_id, username, action, detail, "", "", status_code as i64, ip, user_agent).await;
}
