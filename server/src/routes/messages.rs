use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{ok_empty, AppJson, ApiResponse};
use crate::models::{MessageOut, MessagePage, MessageQuery, UnreadOut};
use crate::state::AppState;

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<MessageQuery>,
) -> AppJson<MessagePage> {
    let page = q.page.unwrap_or(1).max(1);
    let size = q.page_size.unwrap_or(10).clamp(1, 50);
    let offset = (page - 1) * size;
    let unread_only = q.unread_only.unwrap_or(false);

    let where_sql = " WHERE (a.user_id IS NULL OR a.user_id = ?1) AND (?2 = 0 OR a.read = 0)";

    let total: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM messages a{where_sql}"))
        .bind(user.id)
        .bind(if unread_only { 1i64 } else { 0i64 })
        .fetch_one(&state.db)
        .await?;

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages WHERE (user_id IS NULL OR user_id = ?) AND read = 0",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;

    let rows = sqlx::query(&format!(
        "SELECT a.* FROM messages a{where_sql} ORDER BY a.id DESC LIMIT ?3 OFFSET ?4"
    ))
    .bind(user.id)
    .bind(if unread_only { 1i64 } else { 0i64 })
    .bind(size)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let list: Vec<MessageOut> = rows
        .iter()
        .map(|r| MessageOut {
            id: r.try_get("id").unwrap_or_default(),
            title: r.try_get("title").unwrap_or_default(),
            content: r.try_get("content").unwrap_or_default(),
            kind: r.try_get("kind").unwrap_or_default(),
            read: r.try_get("read").unwrap_or_default(),
            is_broadcast: r.try_get::<Option<i64>, _>("user_id").ok().flatten().is_none(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(MessagePage {
                list,
                total,
                page,
                page_size: size,
                unread_count,
            }),
        }),
    ))
}

pub async fn unread(State(state): State<AppState>, user: AuthUser) -> AppJson<UnreadOut> {
    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages WHERE (user_id IS NULL OR user_id = ?) AND read = 0",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(UnreadOut { unread_count }),
        }),
    ))
}

pub async fn mark_read(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<axum::response::Response, crate::error::AppError> {
    sqlx::query("UPDATE messages SET read = 1 WHERE id = ? AND (user_id IS NULL OR user_id = ?)")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok(ok_empty())
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<axum::response::Response, crate::error::AppError> {
    sqlx::query("UPDATE messages SET read = 1 WHERE user_id IS NULL OR user_id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok(ok_empty())
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<axum::response::Response, crate::error::AppError> {
    // 广播消息个人不可删除，只能删除个人消息
    sqlx::query("DELETE FROM messages WHERE id = ? AND user_id = ?")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok(ok_empty())
}
