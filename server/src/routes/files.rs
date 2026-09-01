use axum::extract::multipart::Multipart;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

const MAX_BYTES: usize = 10 * 1024 * 1024;

pub async fn upload(
    State(state): State<AppState>,
    user: AuthUser,
    mut mp: Multipart,
) -> AppJson<serde_json::Value> {
    user.require("system:file:upload")?;
    let mut saved = Vec::new();
    while let Some(field) = mp.next_field().await.map_err(|_| AppError::BadRequest("表单解析失败".into()))? {
        let name = field.file_name().unwrap_or("file").to_string();
        let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
        let data = field.bytes().await.map_err(|_| AppError::BadRequest("读取失败".into()))?;
        if data.len() > MAX_BYTES {
            return Err(AppError::BadRequest("单文件不能超过 10MB".into()));
        }
        std::fs::create_dir_all("data/uploads").ok();
        let safe = name.replace('/', "_").replace('\\', "_").replace("..", "_");
        let filename = format!("{}-{}", chrono::Utc::now().timestamp_millis(), safe);
        std::fs::write(format!("data/uploads/{filename}"), &data)
            .map_err(|e| AppError::Internal(format!("写入失败: {e}")))?;
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO files (name, path, size, mime, owner, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(&name)
        .bind(&filename)
        .bind(data.len() as i64)
        .bind(&mime)
        .bind(&user.username)
        .bind(crate::auth::now_iso())
        .fetch_one(&state.db)
        .await?;
        saved.push(serde_json::json!({ "id": id, "name": name, "url": format!("/uploads/{filename}") }));
    }
    if saved.is_empty() {
        return Err(AppError::BadRequest("未收到文件".into()));
    }
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(saved)) })))
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:file:list")?;
    let rows = sqlx::query("SELECT id, name, path, size, mime, owner, created_at FROM files ORDER BY id DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    let mut total: i64 = 0;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let size: i64 = r.try_get("size").unwrap_or_default();
            total += size;
            serde_json::json!({
                "id": r.try_get::<i64, _>("id").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "size": size,
                "mime": r.try_get::<String, _>("mime").unwrap_or_default(),
                "owner": r.try_get::<String, _>("owner").unwrap_or_default(),
                "url": format!("/uploads/{}", r.try_get::<String, _>("path").unwrap_or_default()),
                "createdAt": r.try_get::<String, _>("created_at").unwrap_or_default(),
            })
        })
        .collect();
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(serde_json::json!({ "list": list, "totalSize": total })),
        }),
    ))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> AppJson<serde_json::Value> {
    user.require("system:file:upload")?;
    let row = sqlx::query("SELECT path FROM files WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let path: String = row.try_get("path")?;
    sqlx::query("DELETE FROM files WHERE id = ?").bind(id).execute(&state.db).await?;
    std::fs::remove_file(format!("data/uploads/{path}")).ok();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
