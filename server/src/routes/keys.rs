use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sha1::{Digest, Sha1};
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

pub fn hash_key(raw: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(auth_secret_prefix().as_bytes());
    hasher.update(raw.as_bytes());
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn auth_secret_prefix() -> String {
    format!("{}:", crate::auth::jwt_secret_str())
}

pub fn generate_raw() -> String {
    use rand::Rng;
    (0..40).map(|_| rand::rng().random_range(0..16).to_string()).collect()
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<std::collections::HashMap<String, String>>,
) -> AppJson<serde_json::Value> {
    user.require("system:key:create")?;
    let name = body.get("name").cloned().unwrap_or_else(|| "未命名".into());
    let raw = format!("jka_{}", generate_raw());
    let hash = hash_key(&raw);
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO api_keys (name, key_hash, prefix, created_by, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(name.trim())
    .bind(&hash)
    .bind(raw.chars().take(11).collect::<String>())
    .bind(user.id)
    .bind(crate::auth::now_iso())
    .fetch_one(&state.db)
    .await?;
    // 明文仅此一次返回
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse {
            code: 0,
            message: "妥善保存，密钥只展示一次".into(),
            data: Some(serde_json::json!({ "id": id, "key": raw })),
        }),
    ))
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:key:list")?;
    let rows = sqlx::query(
        "SELECT k.id, k.name, k.prefix, k.created_at, k.last_used, u.username AS owner
         FROM api_keys k JOIN users u ON u.id = k.created_by ORDER BY k.id DESC",
    )
    .fetch_all(&state.db)
    .await?;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get::<i64, _>("id").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "prefix": r.try_get::<String, _>("prefix").unwrap_or_default(),
                "owner": r.try_get::<String, _>("owner").unwrap_or_default(),
                "createdAt": r.try_get::<String, _>("created_at").unwrap_or_default(),
                "lastUsed": r.try_get::<Option<String>, _>("last_used").ok().flatten().unwrap_or_default(),
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(list)) })))
}

pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> AppJson<serde_json::Value> {
    user.require("system:key:create")?;
    let n = sqlx::query("DELETE FROM api_keys WHERE id = ?").bind(id).execute(&state.db).await?.rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}

/// 认证中间件用：X-API-Key → (created_by uid)
pub async fn lookup(state: &AppState, raw: &str) -> Option<i64> {
    let hash = hash_key(raw);
    let uid: Option<i64> = sqlx::query_scalar("SELECT created_by FROM api_keys WHERE key_hash = ?")
        .bind(&hash)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
    if uid.is_some() {
        let db = state.db.clone();
        tokio::spawn(async move {
            sqlx::query("UPDATE api_keys SET last_used = ? WHERE key_hash = ?")
                .bind(crate::auth::now_iso())
                .bind(&hash)
                .execute(&db)
                .await
                .ok();
        });
    }
    uid
}
