use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("未授权，请先登录")]
    Unauthorized,
    #[error("登录已过期，请重新登录")]
    TokenExpired,
    #[error("无权限执行该操作")]
    Forbidden,
    #[error("{0}")]
    BadRequest(String),
    #[error("资源不存在")]
    NotFound,
    #[error("{0}")]
    TooMany(String),
    #[error("{0}")]
    Conflict(String),
    #[error("数据库错误: {0}")]
    Db(#[from] sqlx::Error),
    #[error("内部错误: {0}")]
    Internal(String),
}

/// 统一响应包裹: { code, message, data }
#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub code: i32,
    pub message: String,
    pub data: Option<T>,
}

pub fn ok_empty() -> Response {
    Json(ApiResponse::<()> {
        code: 0,
        message: "ok".into(),
        data: None,
    })
    .into_response()
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, 401),
            AppError::TokenExpired => (StatusCode::UNAUTHORIZED, 4011),
            AppError::Forbidden => (StatusCode::FORBIDDEN, 403),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, 400),
            AppError::NotFound => (StatusCode::NOT_FOUND, 404),
            AppError::Conflict(_) => (StatusCode::CONFLICT, 409),
            AppError::TooMany(_) => (StatusCode::TOO_MANY_REQUESTS, 429),
            AppError::Db(_) | AppError::Internal(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, 500)
            }
        };
        if matches!(self, AppError::Db(_) | AppError::Internal(_)) {
            tracing::error!("{self:?}");
        }
        (status, Json(ApiResponse::<()> {
            code,
            message: self.to_string(),
            data: None,
        }))
        .into_response()
    }
}

pub type AppJson<T> = Result<(StatusCode, Json<ApiResponse<T>>), AppError>;
