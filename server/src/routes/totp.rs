use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;
use crate::totp;

#[derive(Deserialize)]
pub struct EnableIn {
    pub secret: String,
    pub code: String,
}

#[derive(Deserialize)]
pub struct DisableIn {
    pub password: String,
}

/// 生成/返回待激活密钥（未开启时每次生成新的）
pub async fn setup(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    let row: (i64, Option<String>) = sqlx::query_as("SELECT totp_enabled, totp_secret FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    let secret = if row.0 == 1 {
        return Err(AppError::Conflict("两步验证已开启，请先关闭".into()));
    } else {
        row.1.unwrap_or_else(totp::generate_secret)
    };
    sqlx::query("UPDATE users SET totp_secret = ? WHERE id = ?")
        .bind(&secret)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "用验证器扫码或输入密钥，随后提交 6 位动态码开启".into(),
            data: Some(serde_json::json!({ "secret": secret, "otpauth": totp::otpauth_uri(&user.username, &secret) })),
        }),
    ))
}

pub async fn enable(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<EnableIn>,
) -> AppJson<serde_json::Value> {
    if !totp::verify(&req.secret, req.code.trim()) {
        return Err(AppError::BadRequest("动态码错误，请重试".into()));
    }
    sqlx::query("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?")
        .bind(&req.secret)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "两步验证已开启".into(), data: None })))
}

pub async fn disable(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<DisableIn>,
) -> AppJson<serde_json::Value> {
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    if !crate::auth::verify_password(&req.password, &hash) {
        return Err(AppError::BadRequest("密码错误".into()));
    }
    sqlx::query("UPDATE users SET totp_enabled = 0 WHERE id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "两步验证已关闭".into(), data: None })))
}

pub async fn status(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    let on: i64 = sqlx::query_scalar("SELECT totp_enabled FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({ "enabled": on == 1 })) })))
}
