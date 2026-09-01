use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct TenantIn {
    pub name: String,
    #[serde(default = "default_plan")]
    pub plan: String,
}
fn default_plan() -> String {
    "free".into()
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:config:list")?;
    let rows = sqlx::query(
        "SELECT t.id, t.name, t.plan, t.created_at,
                (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS users
         FROM tenants t ORDER BY t.id",
    )
    .fetch_all(&state.db)
    .await?;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get::<i64, _>("id").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "plan": r.try_get::<String, _>("plan").unwrap_or_default(),
                "users": r.try_get::<i64, _>("users").unwrap_or_default(),
                "createdAt": r.try_get::<String, _>("created_at").unwrap_or_default(),
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(list)) })))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<TenantIn>,
) -> AppJson<serde_json::Value> {
    user.require("system:config:update")?;
    if req.name.trim().is_empty() {
        return Err(AppError::BadRequest("租户名称必填".into()));
    }
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO tenants (name, plan, created_at) VALUES (?, ?, ?) RETURNING id",
    )
    .bind(req.name.trim())
    .bind(req.plan)
    .bind(crate::auth::now_iso())
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::Conflict("租户名称已存在".into()))?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({ "id": id })) })))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    Json(req): Json<TenantIn>,
) -> AppJson<serde_json::Value> {
    user.require("system:config:update")?;
    let n = sqlx::query("UPDATE tenants SET name = ?, plan = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(req.plan)
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> AppJson<serde_json::Value> {
    user.require("system:config:update")?;
    if id == 1 {
        return Err(AppError::BadRequest("默认租户不可删除".into()));
    }
    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE tenant_id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if users > 0 {
        return Err(AppError::Conflict(format!("租户下仍有 {users} 名用户")));
    }
    sqlx::query("DELETE FROM tenants WHERE id = ?").bind(id).execute(&state.db).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
