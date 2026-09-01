use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::{self, AuthUser};
use crate::audit;
use crate::error::{ok_empty, AppJson, ApiResponse};
use crate::models::SessionOut;
use crate::state::AppState;

pub async fn my_sessions(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppJson<Vec<SessionOut>> {
    let rows = sqlx::query(
        "SELECT * FROM sessions WHERE user_id = ? AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC",
    )
    .bind(user.id)
    .bind(auth::now_iso())
    .fetch_all(&state.db)
    .await?;

    let list = rows
        .iter()
        .map(|r| SessionOut {
            id: r.try_get("id").unwrap_or_default(),
            username: r.try_get("username").unwrap_or_default(),
            is_current: user.jti.as_deref() == r.try_get::<String, _>("jti").ok().as_deref(),
            is_mine: true,
            ip: r.try_get("ip").unwrap_or_default(),
            user_agent: r.try_get("user_agent").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            expires_at: r.try_get("expires_at").unwrap_or_default(),
        })
        .collect();

    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(list) })))
}

pub async fn all_sessions(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppJson<Vec<SessionOut>> {
    user.require("system:session:list")?;
    let rows = sqlx::query(
        "SELECT * FROM sessions WHERE revoked = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 200",
    )
    .bind(auth::now_iso())
    .fetch_all(&state.db)
    .await?;

    let list = rows
        .iter()
        .map(|r| {
            let uid: i64 = r.try_get("user_id").unwrap_or_default();
            SessionOut {
                id: r.try_get("id").unwrap_or_default(),
                username: r.try_get("username").unwrap_or_default(),
                is_current: user.jti.as_deref() == r.try_get::<String, _>("jti").ok().as_deref(),
                is_mine: uid == user.id,
                ip: r.try_get("ip").unwrap_or_default(),
                user_agent: r.try_get("user_agent").unwrap_or_default(),
                created_at: r.try_get("created_at").unwrap_or_default(),
                expires_at: r.try_get("expires_at").unwrap_or_default(),
            }
        })
        .collect();

    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(list) })))
}

/// 吊销任意会话：本人会话免权限；他人会话需 system:session:revoke
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    raw: axum::http::request::Parts,
) -> Result<axum::response::Response, crate::error::AppError> {
    let row = sqlx::query("SELECT user_id, jti, username FROM sessions WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    let owner: i64 = row.try_get("user_id")?;
    if owner != user.id {
        user.require("system:session:revoke")?;
    }
    let jti: String = row.try_get("jti")?;
    auth::revoke_session_by_jti(&state.db, &jti).await;
    audit::record(
        &state,
        Some(user.id),
        &user.username,
        "吊销会话",
        &format!("吊销 {username} 的会话", username = row.try_get::<String, _>("username").unwrap_or_default()),
        &raw,
        200,
    )
    .await;
    Ok(ok_empty())
}

/// 吊销当前用户除本会话以外的全部会话
pub async fn revoke_others(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<axum::response::Response, crate::error::AppError> {
    if let Some(jti) = &user.jti {
        sqlx::query("UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0 AND jti != ?")
            .bind(user.id)
            .bind(jti)
            .execute(&state.db)
            .await?;
    } else {
        sqlx::query("UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0")
            .bind(user.id)
            .execute(&state.db)
            .await?;
    }
    Ok(ok_empty())
}
