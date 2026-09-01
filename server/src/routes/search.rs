use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;

use crate::auth::AuthUser;
use crate::error::{AppJson, ApiResponse};
use crate::state::AppState;

fn pairs_out(rows: Vec<(i64, String, String)>) -> Vec<serde_json::Value> {
    rows.into_iter()
        .map(|(id, label, sub)| serde_json::json!({ "id": id, "label": label, "sub": sub }))
        .collect()
}

pub async fn unified(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> AppJson<serde_json::Value> {
    let kw = q.get("q").cloned().unwrap_or_default();
    let kw = kw.trim();
    if kw.len() < 1 {
        return Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({})) })));
    }

    let users: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, nickname || ' (' || username || ')', COALESCE(dept, '')
         FROM users WHERE deleted_at IS NULL AND (username LIKE '%'||?1||'%' OR nickname LIKE '%'||?1||'%' OR email LIKE '%'||?1||'%') LIMIT 5",
    )
    .bind(kw)
    .fetch_all(&state.db)
    .await?;
    let depts: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, name, '' FROM departments WHERE name LIKE '%'||?1||'%' LIMIT 5",
    )
    .bind(kw)
    .fetch_all(&state.db)
    .await?;
    let logs: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, action, detail FROM audit_logs
         WHERE username LIKE '%'||?1||'%' OR action LIKE '%'||?1||'%' OR detail LIKE '%'||?1||'%' OR path LIKE '%'||?1||'%'
         ORDER BY id DESC LIMIT 5",
    )
    .bind(kw)
    .fetch_all(&state.db)
    .await?;
    let msgs: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, title, content FROM messages WHERE title LIKE '%'||?1||'%' OR content LIKE '%'||?1||'%' ORDER BY id DESC LIMIT 5",
    )
    .bind(kw)
    .fetch_all(&state.db)
    .await?;

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(serde_json::json!({
                "users": pairs_out(users),
                "departments": pairs_out(depts),
                "auditLogs": pairs_out(logs),
                "messages": pairs_out(msgs),
            })),
        }),
    ))
}
