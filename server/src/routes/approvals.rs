use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::db;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ApplyIn {
    #[serde(rename = "roleId")]
    pub role_id: i64,
    #[serde(default)]
    pub reason: String,
}

/// 申请可选角色（登录即可）
pub async fn roles(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    let rows = sqlx::query(
        "SELECT r.id, r.name, r.code, r.description,
                EXISTS(SELECT 1 FROM user_roles ur WHERE ur.role_id = r.id AND ur.user_id = ?) AS owned
         FROM roles r WHERE r.status = 1 ORDER BY r.id",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get::<i64, _>("id").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "code": r.try_get::<String, _>("code").unwrap_or_default(),
                "description": r.try_get::<String, _>("description").unwrap_or_default(),
                "owned": r.try_get::<i64, _>("owned").unwrap_or(0) == 1,
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(list)) })))
}

pub async fn apply(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<ApplyIn>,
) -> AppJson<serde_json::Value> {
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles WHERE id = ?")
        .bind(req.role_id)
        .fetch_one(&state.db)
        .await?;
    if exists == 0 {
        return Err(AppError::BadRequest("角色不存在".into()));
    }
    let has: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_roles WHERE user_id = ? AND role_id = ?")
        .bind(user.id)
        .bind(req.role_id)
        .fetch_one(&state.db)
        .await?;
    if has > 0 {
        return Err(AppError::Conflict("你已拥有该角色".into()));
    }
    let pending: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM role_requests WHERE user_id = ? AND role_id = ? AND status = 'pending'",
    )
    .bind(user.id)
    .bind(req.role_id)
    .fetch_one(&state.db)
    .await?;
    if pending > 0 {
        return Err(AppError::Conflict("已有待审批申请".into()));
    }
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO role_requests (user_id, role_id, reason, status, created_at) VALUES (?, ?, ?, 'pending', ?) RETURNING id",
    )
    .bind(user.id)
    .bind(req.role_id)
    .bind(req.reason.trim())
    .bind(crate::auth::now_iso())
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "申请已提交".into(), data: Some(serde_json::json!({ "id": id })) })))
}

async fn query_list(state: &AppState, where_sql: &str, uid: i64) -> Result<Vec<serde_json::Value>, AppError> {
    let rows = sqlx::query(&format!(
        "SELECT q.id, q.user_id, q.reason, q.status, q.created_at, q.handled_at, q.role_id,
                u.username AS uname, r.name AS rname, r.code AS rcode
         FROM role_requests q
         JOIN users u ON u.id = q.user_id
         JOIN roles r ON r.id = q.role_id
         {where_sql}
         ORDER BY q.id DESC LIMIT 200"
    ))
    .bind(uid)
    .fetch_all(&state.db)
    .await?;
    Ok(rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get::<i64, _>("id").unwrap_or_default(),
                "username": r.try_get::<String, _>("uname").unwrap_or_default(),
                "roleName": r.try_get::<String, _>("rname").unwrap_or_default(),
                "roleCode": r.try_get::<String, _>("rcode").unwrap_or_default(),
                "roleId": r.try_get::<i64, _>("role_id").unwrap_or_default(),
                "reason": r.try_get::<String, _>("reason").unwrap_or_default(),
                "status": r.try_get::<String, _>("status").unwrap_or_default(),
                "createdAt": r.try_get::<String, _>("created_at").unwrap_or_default(),
                "handledAt": r.try_get::<Option<String>, _>("handled_at").ok().flatten().unwrap_or_default(),
            })
        })
        .collect())
}

pub async fn mine(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    let data = query_list(&state, "WHERE q.user_id = ?", user.id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(data)) })))
}

pub async fn all(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:approval:list")?;
    let data = query_list(&state, "WHERE 1=1", 0).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(data)) })))
}

pub async fn decide(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, verdict)): Path<(i64, String)>,
) -> AppJson<serde_json::Value> {
    user.require("system:approval:handle")?;
    let approve = match verdict.as_str() {
        "approve" => true,
        "reject" => false,
        _ => return Err(AppError::NotFound),
    };
    let row = sqlx::query("SELECT user_id, role_id, status FROM role_requests WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    if row.try_get::<String, _>("status")? != "pending" {
        return Err(AppError::Conflict("该申请已被处理".into()));
    }
    let (uid, rid): (i64, i64) = (row.try_get("user_id")?, row.try_get("role_id")?);
    sqlx::query("UPDATE role_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?")
        .bind(if approve { "approved" } else { "rejected" })
        .bind(user.id)
        .bind(crate::auth::now_iso())
        .bind(id)
        .execute(&state.db)
        .await?;
    if approve {
        db::link_role(&state.db, uid, rid).await?;
        let rname: String = sqlx::query_scalar("SELECT name FROM roles WHERE id = ?")
            .bind(rid)
            .fetch_one(&state.db)
            .await?;
        db::notify_user(&state.db, uid, "权限申请已通过", &format!("你申请的「{rname}」角色已开通，重新登录或刷新后生效"), "info").await;
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
