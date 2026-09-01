use axum::extract::multipart::{Field, Multipart};
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::models::AvatarOut;
use crate::state::AppState;

const MAX_BYTES: usize = 2 * 1024 * 1024;

pub async fn avatar(
    State(state): State<AppState>,
    user: AuthUser,
    mut fields: Multipart,
) -> AppJson<AvatarOut> {
    user.require("system:settings")?;
    let mut ext: Option<String> = None;
    let mut data: Vec<u8> = Vec::new();

    while let Some(field) = fields.next_field().await.map_err(|_| AppError::BadRequest("表单解析失败".into()))? {
        if field.name() != Some("file") {
            continue;
        }
        ext = field.content_type().and_then(guess_ext);
        let mut f: Field = field;
        while let Some(chunk) = f.chunk().await.map_err(|_| AppError::BadRequest("文件读取失败".into()))? {
            if data.len() + chunk.len() > MAX_BYTES {
                return Err(AppError::BadRequest("图片超过 2MB".into()));
            }
            data.extend_from_slice(&chunk);
        }
    }

    let ext = ext.ok_or_else(|| AppError::BadRequest("仅支持 png / jpeg / webp / gif".into()))?;
    if data.is_empty() {
        return Err(AppError::BadRequest("文件为空".into()));
    }

    std::fs::create_dir_all("data/uploads")
        .map_err(|e| AppError::Internal(format!("上传目录不可用: {e}")))?;
    let filename = format!("avatar-{}-{}.{}", user.id, chrono::Utc::now().timestamp_millis(), ext);
    std::fs::write(format!("data/uploads/{filename}"), &data)
        .map_err(|e| AppError::Internal(format!("写入失败: {e}")))?;

    let url = format!("/uploads/{filename}");
    sqlx::query("UPDATE users SET avatar = ? WHERE id = ?")
        .bind(&url)
        .bind(user.id)
        .execute(&state.db)
        .await?;

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(AvatarOut { avatar: url }),
        }),
    ))
}

fn guess_ext(ct: &str) -> Option<String> {
    match ct {
        "image/png" => Some("png".into()),
        "image/jpeg" => Some("jpg".into()),
        "image/webp" => Some("webp".into()),
        "image/gif" => Some("gif".into()),
        _ => None,
    }
}
