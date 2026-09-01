use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ConfigIn {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub is_public: Option<i64>,
}

#[derive(Deserialize)]
pub struct ConfigBulk {
    pub items: Vec<ConfigIn>,
}

async fn broadcast_announce(state: &AppState, key: &str, value: &str) {
    if key == "announcement" {
        crate::notify::push(serde_json::json!({ "type": "announce", "content": value }));
    }
}

/// 公开配置（登录页等未认证场景）
pub async fn public(State(state): State<AppState>) -> AppJson<serde_json::Value> {
    let rows = sqlx::query("SELECT key, value FROM configs WHERE is_public = 1")
        .fetch_all(&state.db)
        .await?;
    let map: serde_json::Map<String, serde_json::Value> = rows
        .iter()
        .map(|r| {
            (
                r.try_get::<String, _>("key").unwrap_or_default(),
                serde_json::Value::String(r.try_get("value").unwrap_or_default()),
            )
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Object(map)) })))
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:config:list")?;
    let rows = sqlx::query("SELECT key, value, label, is_public, updated_at FROM configs ORDER BY key")
        .fetch_all(&state.db)
        .await?;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "key": r.try_get::<String, _>("key").unwrap_or_default(),
                "value": r.try_get::<String, _>("value").unwrap_or_default(),
                "label": r.try_get::<String, _>("label").unwrap_or_default(),
                "isPublic": r.try_get::<i64, _>("is_public").unwrap_or(0),
                "updatedAt": r.try_get::<String, _>("updated_at").unwrap_or_default(),
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(list)) })))
}

pub async fn upsert(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ConfigBulk>,
) -> AppJson<serde_json::Value> {
    user.require("system:config:update")?;
    if body.items.len() > 100 {
        return Err(AppError::BadRequest("单次最多 100 项".into()));
    }
    for item in body.items {
        let n = sqlx::query(
            "INSERT INTO configs (key, value, label, is_public, updated_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value,
               label = COALESCE(NULLIF(excluded.label, ''), configs.label), updated_at = excluded.updated_at",
        )
        .bind(&item.key)
        .bind(&item.value)
        .bind(item.label.unwrap_or_default())
        .bind(item.is_public.unwrap_or(0))
        .bind(crate::auth::now_iso())
        .execute(&state.db)
        .await?
        .rows_affected();
        if n == 0 {
            return Err(AppError::NotFound);
        }
        broadcast_announce(&state, &item.key, &item.value).await;
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
