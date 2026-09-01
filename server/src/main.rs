#![recursion_limit = "512"]
mod audit;
mod auth;
mod db;
mod error;
mod metrics;
mod mw;

mod security;
mod notify;
mod totp;
mod models;
mod routes;
mod state;

#[cfg(test)]
mod tests;

use std::time::Duration;

use axum::routing::{delete, get, post, put};
use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;
use tracing_subscriber::Layer as _;
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "jing_admin_server=info,tower_http=warn".into());
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::Layer::new().with_writer(std::io::stdout).with_filter(env_filter))
        .with(tracing_subscriber::fmt::Layer::new().with_writer(std::io::stdout).with_filter(routes::logs::LevelGate))
        .init();

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://./data/jing_admin.db?mode=rwc".into());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9800);

    if std::env::var("JWT_SECRET").is_err() {
        tracing::warn!("未设置 JWT_SECRET，使用开发默认密钥，生产环境务必覆盖！");
    }

    let pool = db::init_pool(&db_url)
        .await
        .expect("数据库初始化失败");

    routes::logs::restore(&pool).await;

    std::fs::create_dir_all("data/uploads").ok();
    spawn_retention_task(pool.clone());

    let state = AppState::new(pool.clone());
    let mut app = build_app(state.clone());
    // 单容器部署：SERVE_STATIC 指向前端 dist 时由 Axum 直接托管 SPA
    if let Ok(dir) = std::env::var("SERVE_STATIC") {
        if std::path::Path::new(&dir).is_dir() {
            app = app.fallback_service(
                tower_http::services::ServeDir::new(&dir).fallback(
                    tower_http::services::ServeFile::new(format!("{dir}/index.html")),
                ),
            );
            tracing::info!("静态托管已启用: {dir}");
        }
    }
    routes::tasks::spawn_scheduler(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("端口绑定失败");
    tracing::info!("jing-admin server 已启动: http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("服务异常退出");
}

pub fn build_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .nest_service("/uploads", tower_http::services::ServeDir::new("data/uploads"))
        .route("/api/health", get(|| async { axum::Json(serde_json::json!({ "status": "ok" })) }))
        .route("/api/auth/login", post(routes::auth::login))
        .route("/api/auth/refresh", post(routes::auth::refresh))
        .route("/api/auth/logout", post(routes::auth::logout))
        .route("/api/auth/me", get(routes::auth::me))
        .route("/api/auth/oauth/status", get(routes::oauth::status))
        .route("/api/auth/oauth/login", get(routes::oauth::login))
        .route("/api/auth/oauth/callback", get(routes::oauth::callback))
        .route("/api/ws", get(routes::ws::handler))
        .route("/api/docs/openapi.json", get(routes::docs::openapi))
        .route("/api/uploads/avatar", post(routes::uploads::avatar))
        .route("/api/sessions", get(routes::sessions::my_sessions))
        .route("/api/sessions/all", get(routes::sessions::all_sessions))
        .route("/api/sessions/revoke-others", put(routes::sessions::revoke_others))
        .route("/api/sessions/{id}", delete(routes::sessions::revoke))
        .route("/api/departments", get(routes::departments::tree).post(routes::departments::create))
        .route("/api/departments/{id}", put(routes::departments::update).delete(routes::departments::remove))
        .route("/api/audit/logs/old", delete(audit::purge))
        .route("/api/search", get(routes::search::unified))
        .route("/api/presence", get(presence))
        .route("/api/metrics", get(metrics_route))
        .route("/api/configs/public", get(routes::config::public))
        .route("/api/configs", get(routes::config::list).put(routes::config::upsert))
        .route("/api/dict", get(routes::dict::tree))
        .route("/api/dict/types", post(routes::dict::add_type))
        .route("/api/dict/items", post(routes::dict::add_item))
        .route("/api/dict/items/{id}", put(routes::dict::update_item).delete(routes::dict::remove_item))
        .route("/api/files", get(routes::files::list).post(routes::files::upload))
        .route("/api/files/{id}", delete(routes::files::remove))
        .route("/api/applications/roles", get(routes::approvals::roles))
        .route("/api/applications", get(routes::approvals::mine).post(routes::approvals::apply))
        .route("/api/applications/all", get(routes::approvals::all))
        .route("/api/applications/{id}/{verdict}", put(routes::approvals::decide))
        .route("/api/tasks", get(routes::tasks::list))
        .route("/api/tasks/{id}/run", post(routes::tasks::run_now))
        .route("/api/keys", get(routes::keys::list).post(routes::keys::create))
        .route("/api/keys/{id}", delete(routes::keys::revoke))
        .route("/api/totp", get(routes::totp::status).post(routes::totp::setup))
        .route("/api/totp/enable", put(routes::totp::enable))
        .route("/api/totp/disable", put(routes::totp::disable))
        .route("/api/audit/verify", get(audit_verify))
        .route("/api/tenants", get(routes::tenants::list).post(routes::tenants::create))
        .route("/api/tenants/{id}", put(routes::tenants::update).delete(routes::tenants::remove))
        .route("/api/health/deep", get(health_deep))
        .route("/api/logs/level", get(routes::logs::get_level).put(routes::logs::put_level))
        .route("/api/users/trash", get(routes::users::trash))
        .route("/api/users/{id}/restore", put(routes::users::restore))
        .route("/api/users/{id}/purge", delete(routes::users::purge))
        .route("/api/profile", put(routes::auth::update_profile))
        .route("/api/profile/password", put(routes::auth::change_password))
        .route("/api/users", get(routes::users::list).post(routes::users::create))
        .route("/api/users/export", get(routes::users::export))
        .route("/api/users/import", post(routes::users::import))
        .route("/api/users/{id}", put(routes::users::update).delete(routes::users::remove))
        .route("/api/messages", get(routes::messages::list))
        .route("/api/messages/unread", get(routes::messages::unread))
        .route("/api/messages/read-all", put(routes::messages::mark_all_read))
        .route("/api/messages/{id}/read", put(routes::messages::mark_read))
        .route("/api/messages/{id}", delete(routes::messages::remove))
        .route(
            "/api/roles",
            get(routes::roles::list).post(routes::roles::create),
        )
        .route("/api/roles/permissions", get(routes::roles::permissions))
        .route("/api/roles/{id}", put(routes::roles::update).delete(routes::roles::remove))
        .route("/api/dashboard/overview", get(routes::dashboard::overview))
        .route("/api/audit/logs", get(audit::list))
        .layer(TraceLayer::new_for_http())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            audit::write_log,
        ))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            mw::rate_limit,
        ))
        .layer(cors)
        .with_state(state)
}

async fn presence(user: crate::auth::AuthUser, axum::extract::State(_state): axum::extract::State<AppState>) -> axum::Json<serde_json::Value> {
    let _ = user;
    axum::Json(serde_json::json!({ "code": 0, "message": "ok", "data": { "online": crate::routes::ws::online_count() } }))
}

async fn metrics_route(user: crate::auth::AuthUser) -> Result<String, crate::error::AppError> {
    user.require("system:config:list")?;
    Ok(crate::metrics::render(crate::routes::ws::online_count()))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal 注册失败")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("收到退出信号，正在优雅关闭…");
    tokio::time::sleep(Duration::from_millis(100)).await;
}

/// 可选的审计日志保留任务：AUDIT_RETENTION_DAYS（默认 0 = 关闭）
fn spawn_retention_task(pool: crate::db::Db) {
    let days: i64 = std::env::var("AUDIT_RETENTION_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if days < 7 {
        return;
    }
    tokio::spawn(async move {
        loop {
            let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
            match sqlx::query("DELETE FROM audit_logs WHERE created_at < ?")
                .bind(cutoff.to_rfc3339())
                .execute(&pool)
                .await
            {
                Ok(r) if r.rows_affected() > 0 => tracing::info!("审计保留任务清理 {} 条", r.rows_affected()),
                Err(e) => tracing::warn!("审计保留任务失败: {e}"),
                _ => {}
            }
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}

async fn audit_verify(user: crate::auth::AuthUser, axum::extract::State(state): axum::extract::State<AppState>) -> axum::Json<serde_json::Value> {
    let _ = user;
    axum::Json(serde_json::json!({ "code": 0, "message": "ok", "data": crate::security::verify_chain(&state.db).await }))
}

async fn health_deep(user: crate::auth::AuthUser, axum::extract::State(state): axum::extract::State<AppState>) -> axum::Json<serde_json::Value> {
    let _ = user;
    let t0 = std::time::Instant::now();
    let db_ok = sqlx::query("SELECT 1").fetch_one(&state.db).await.is_ok();
    axum::Json(serde_json::json!({
        "code": 0, "message": "ok",
        "data": {
            "db": { "ok": db_ok, "latencyMs": t0.elapsed().as_millis() },
            "wsOnline": crate::routes::ws::online_count(),
            "uptimeSecs": crate::metrics::uptime_secs(),
        }
    }))
}
