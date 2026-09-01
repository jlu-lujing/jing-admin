use axum::extract::{Request, State as ExtractState};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;

use crate::security;
use crate::state::AppState;

/// 令牌桶限流：key = Bearer 用户名 或 IP；阈值来自 configs.rate_limit_per_min（每请求读，可动态调）
pub async fn rate_limit(
    ExtractState(state): ExtractState<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    if !path.starts_with("/api/") || path == "/api/health" {
        return next.run(req).await;
    }
    let limit = security::cfg_num(&state, "rate_limit_per_min", 0).await;
    let key = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| {
            crate::auth::verify_token(t, "access")
                .map(|c| format!("u:{}", c.username))
                .unwrap_or_else(|_| "t:bad".into())
        })
        .or_else(|| {
            req.headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .map(|s| format!("ip:{}", s.split(',').next().unwrap_or("")))
        })
        .unwrap_or_else(|| "ip:unknown".into());

    if !security::take_token(&state, &key, limit) {
        return Response::builder()
            .status(StatusCode::TOO_MANY_REQUESTS)
            .header("retry-after", "2")
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .body(axum::body::Body::from(
                r#"{"code":429,"message":"请求过于频繁，请稍后再试","data":null}"#.to_string(),
            ))
            .unwrap();
    }
    next.run(req).await
}
