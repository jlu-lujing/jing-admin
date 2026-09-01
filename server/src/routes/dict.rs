use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ItemIn {
    #[serde(rename = "typeCode")]
    pub type_code: String,
    pub value: String,
    pub label: String,
    #[serde(default)]
    pub sort: Option<i64>,
    #[serde(default = "default_one")]
    pub enabled: i64,
}

fn default_one() -> i64 {
    1
}

pub async fn tree(State(state): State<AppState>) -> AppJson<serde_json::Value> {
    let types = sqlx::query("SELECT code, name FROM dict_types ORDER BY code")
        .fetch_all(&state.db)
        .await?;
    let items = sqlx::query("SELECT id, type_code, value, label, sort, enabled FROM dict_items ORDER BY sort ASC, id ASC")
        .fetch_all(&state.db)
        .await?;
    let out: Vec<serde_json::Value> = types
        .iter()
        .map(|t| {
            let code: String = t.try_get("code").unwrap_or_default();
            let children: Vec<serde_json::Value> = items
                .iter()
                .filter(|i| i.try_get::<String, _>("type_code").unwrap_or_default() == code)
                .map(|i| {
                    serde_json::json!({
                        "id": i.try_get::<i64, _>("id").unwrap_or_default(),
                        "value": i.try_get::<String, _>("value").unwrap_or_default(),
                        "label": i.try_get::<String, _>("label").unwrap_or_default(),
                        "sort": i.try_get::<i64, _>("sort").unwrap_or_default(),
                        "enabled": i.try_get::<i64, _>("enabled").unwrap_or_default(),
                    })
                })
                .collect();
            serde_json::json!({
                "code": code,
                "name": t.try_get::<String, _>("name").unwrap_or_default(),
                "items": children,
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(out)) })))
}

pub async fn add_item(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<ItemIn>,
) -> AppJson<serde_json::Value> {
    user.require("system:dict:update")?;
    if req.value.trim().is_empty() || req.label.trim().is_empty() {
        return Err(AppError::BadRequest("value 与 label 必填".into()));
    }
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO dict_items (type_code, value, label, sort, enabled) VALUES (?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(&req.type_code)
    .bind(req.value.trim())
    .bind(req.label.trim())
    .bind(req.sort.unwrap_or(0))
    .bind(req.enabled)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({ "id": id })) })))
}

pub async fn update_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    Json(req): Json<ItemIn>,
) -> AppJson<serde_json::Value> {
    user.require("system:dict:update")?;
    let n = sqlx::query("UPDATE dict_items SET value = ?, label = ?, sort = ?, enabled = ? WHERE id = ?")
        .bind(req.value.trim())
        .bind(req.label.trim())
        .bind(req.sort.unwrap_or(0))
        .bind(req.enabled)
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}

pub async fn remove_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> AppJson<serde_json::Value> {
    user.require("system:dict:update")?;
    sqlx::query("DELETE FROM dict_items WHERE id = ?").bind(id).execute(&state.db).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}

pub async fn add_type(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<std::collections::HashMap<String, String>>,
) -> AppJson<serde_json::Value> {
    user.require("system:dict:update")?;
    let code = body.get("code").cloned().unwrap_or_default();
    let name = body.get("name").cloned().unwrap_or_default();
    if code.trim().is_empty() || name.trim().is_empty() {
        return Err(AppError::BadRequest("code 与 name 必填".into()));
    }
    sqlx::query("INSERT INTO dict_types (code, name, created_at) VALUES (?, ?, ?)")
        .bind(code.trim())
        .bind(name.trim())
        .bind(crate::auth::now_iso())
        .execute(&state.db)
        .await
        .map_err(|_| AppError::Conflict("字典类型已存在".into()))?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
