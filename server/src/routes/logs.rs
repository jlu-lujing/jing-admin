use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::atomic::{AtomicU8, Ordering};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::{Context, Filter, Layer};

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

/// 动态级别门：0=trace 1=debug 2=info 3=warn 4=error
pub static MAX_LEVEL: AtomicU8 = AtomicU8::new(2);

pub fn set_level(code: u8) {
    MAX_LEVEL.store(code, Ordering::Relaxed);
}

#[derive(Clone)]
pub struct LevelGate;

impl LevelGate {
    fn allow(&self, level: Option<tracing::Level>) -> bool {
        let max = MAX_LEVEL.load(Ordering::Relaxed);
        let lv = match level {
            Some(tracing::Level::TRACE) => 0,
            Some(tracing::Level::DEBUG) => 1,
            Some(tracing::Level::INFO) => 2,
            Some(tracing::Level::WARN) => 3,
            Some(tracing::Level::ERROR) => 4,
            None => 2,
        };
        lv >= max
    }
}

impl<S: Subscriber> Layer<S> for LevelGate {
    fn on_event(&self, _event: &Event<'_>, _ctx: Context<'_, S>) {}
}

impl<S: Subscriber> Filter<S> for LevelGate {
    fn enabled(&self, meta: &tracing::Metadata<'_>, _: &Context<'_, S>) -> bool {
        let code = match *meta.level() {
            tracing::Level::TRACE => 0,
            tracing::Level::DEBUG => 1,
            tracing::Level::INFO => 2,
            tracing::Level::WARN => 3,
            tracing::Level::ERROR => 4,
        };
        self.allow(Some(match code {
            0 => tracing::Level::TRACE,
            1 => tracing::Level::DEBUG,
            2 => tracing::Level::INFO,
            3 => tracing::Level::WARN,
            _ => tracing::Level::ERROR,
        }))
    }
}

pub async fn get_level(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:config:list")?;
    let stored: Option<String> = sqlx::query_scalar("SELECT value FROM configs WHERE key = 'log_level'")
        .fetch_optional(&state.db)
        .await?;
    let level = stored.unwrap_or_else(|| level_name(MAX_LEVEL.load(Ordering::Relaxed)).into());
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({ "level": level })) })))
}

fn level_name(code: u8) -> &'static str {
    match code {
        0 => "trace",
        1 => "debug",
        2 => "info",
        3 => "warn",
        _ => "error",
    }
}

fn level_code(name: &str) -> Option<u8> {
    match name {
        "trace" => Some(0),
        "debug" => Some(1),
        "info" => Some(2),
        "warn" => Some(3),
        "error" => Some(4),
        _ => None,
    }
}

#[derive(Deserialize)]
pub struct LevelIn {
    pub level: String,
}

pub async fn put_level(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<LevelIn>,
) -> AppJson<serde_json::Value> {
    user.require("system:config:update")?;
    let code = level_code(req.level.trim()).ok_or_else(|| AppError::BadRequest("级别需为 trace/debug/info/warn/error".into()))?;
    set_level(code);
    sqlx::query(
        "INSERT INTO configs (key, value, label, is_public, updated_at) VALUES ('log_level', ?, '动态日志级别', 0, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(req.level.trim())
    .bind(crate::auth::now_iso())
    .execute(&state.db)
    .await?;
    tracing::warn!("日志级别热更新为 {}", req.level.trim());
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "已生效".into(), data: Some(serde_json::json!({ "level": req.level.trim() })) })))
}

/// 启动时从配置恢复
pub async fn restore(db: &crate::db::Db) {
    if let Ok(Some(v)) = sqlx::query_scalar::<_, String>("SELECT value FROM configs WHERE key = 'log_level'").fetch_optional(db).await {
        if let Some(c) = level_code(&v) {
            set_level(c);
        }
    }
}
