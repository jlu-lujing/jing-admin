use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Redirect;
use axum::Json;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

use crate::auth;
use crate::db;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

const ACCESS_TTL: i64 = 2 * 60 * 60;
const REFRESH_TTL: i64 = 7 * 24 * 60 * 60;

struct OidcCfg {
    issuer: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    frontend: String,
}

fn cfg() -> Option<OidcCfg> {
    Some(OidcCfg {
        issuer: std::env::var("OIDC_ISSUER").ok()?.trim_end_matches('/').to_string(),
        client_id: std::env::var("OIDC_CLIENT_ID").ok()?,
        client_secret: std::env::var("OIDC_CLIENT_SECRET").ok()?,
        redirect_uri: std::env::var("OIDC_REDIRECT_URI")
            .unwrap_or_else(|_| "http://localhost:9800/api/auth/oauth/callback".into()),
        frontend: std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5273".into()),
    })
}

pub fn enabled() -> bool {
    std::env::var("OIDC_ISSUER").is_ok()
        && std::env::var("OIDC_CLIENT_ID").is_ok()
        && std::env::var("OIDC_CLIENT_SECRET").is_ok()
}

static PENDING: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();
static DISCOVERY: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn pending() -> &'static Mutex<HashMap<String, i64>> {
    PENDING.get_or_init(Default::default)
}

fn discovery() -> &'static Mutex<HashMap<String, String>> {
    DISCOVERY.get_or_init(Default::default)
}

async fn endpoint(name: &str) -> Result<String, AppError> {
    {
        let map = discovery().lock().unwrap();
        if let Some(u) = map.get(name) {
            return Ok(u.clone());
        }
    }
    let issuer = std::env::var("OIDC_ISSUER").map_err(|_| AppError::BadRequest("SSO 未启用".into()))?;
    let url = format!("{}/.well-known/openid-configuration", issuer.trim_end_matches('/'));
    let doc: serde_json::Value = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("OIDC discovery 失败: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("OIDC discovery 解析失败: {e}")))?;
    let mut map = discovery().lock().unwrap();
    for k in ["authorization_endpoint", "token_endpoint", "userinfo_endpoint"] {
        if let Some(v) = doc.get(k).and_then(|v| v.as_str()) {
            map.insert(k.to_string(), v.to_string());
        }
    }
    map.get(name)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("OIDC 文档缺少 {name}")))
}

fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

pub async fn status() -> AppJson<serde_json::Value> {
    let data = serde_json::json!({
        "enabled": enabled(),
        "provider": if enabled() { "OIDC" } else { "none" },
    });
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(data) })))
}

pub async fn login() -> Result<Redirect, AppError> {
    let c = cfg().ok_or_else(|| AppError::BadRequest("SSO 未启用".into()))?;
    let auth_ep = endpoint("authorization_endpoint").await?;
    let state = rand_hex(32);
    {
        let mut map = pending().lock().unwrap();
        map.retain(|_, exp| *exp > chrono::Utc::now().timestamp());
        map.insert(state.clone(), chrono::Utc::now().timestamp() + 300);
    }
    let url = format!(
        "{auth_ep}?response_type=code&scope={}&client_id={}&redirect_uri={}&state={}",
        pct("openid profile email"),
        pct(&c.client_id),
        pct(&c.redirect_uri),
        state,
    );
    Ok(Redirect::temporary(&url))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

pub async fn callback(
    State(state): State<AppState>,
    Query(q): Query<CallbackQuery>,
) -> Result<Redirect, AppError> {
    let c = cfg().ok_or_else(|| AppError::BadRequest("SSO 未启用".into()))?;
    let code = q.code.ok_or_else(|| AppError::BadRequest("缺少 code".into()))?;
    let st = q.state.ok_or_else(|| AppError::BadRequest("缺少 state".into()))?;
    let valid = pending().lock().unwrap().remove(&st).is_some();
    if !valid {
        return Err(AppError::BadRequest("state 校验失败或已过期".into()));
    }

    let client = reqwest::Client::new();
    let token_ep = endpoint("token_endpoint").await?;
    let token_res: serde_json::Value = client
        .post(&token_ep)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("client_id", c.client_id.as_str()),
            ("client_secret", c.client_secret.as_str()),
            ("redirect_uri", c.redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("token 交换失败: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("token 响应解析失败: {e}")))?;

    let at = token_res
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("未获得 access_token".into()))?
        .to_string();

    let info_ep = endpoint("userinfo_endpoint").await?;
    let profile: serde_json::Value = client
        .get(&info_ep)
        .bearer_auth(&at)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("userinfo 拉取失败: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("userinfo 解析失败: {e}")))?;

    let sub = profile.get("sub").and_then(|v| v.as_str()).unwrap_or("unknown");
    let preferred = profile.get("preferred_username").and_then(|v| v.as_str());
    let email = profile.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let name = profile
        .get("name")
        .and_then(|v| v.as_str())
        .or(preferred)
        .unwrap_or(sub);
    let username = preferred
        .map(sanitize_username)
        .unwrap_or_else(|| sanitize_username(&format!("sso_{sub}")));

    let user_id = find_or_provision(&state, &username, name, email).await?;

    let (access, access_jti) = auth::create_token(user_id, &username, "access", ACCESS_TTL)?;
    let (refresh, refresh_jti) = auth::create_token(user_id, &username, "refresh", REFRESH_TTL)?;
    sqlx::query("UPDATE users SET last_login = ? WHERE id = ?")
        .bind(auth::now_iso())
        .bind(user_id)
        .execute(&state.db)
        .await?;
    auth::create_session(&state.db, user_id, &username, &access_jti, &refresh_jti, "", "", ACCESS_TTL).await;

    Ok(Redirect::to(&format!(
        "{}/login#sso={}.{}",
        c.frontend.trim_end_matches('/'),
        access,
        refresh,
    )))
}

fn rand_hex(n: usize) -> String {
    use rand::Rng;
    (0..n).map(|_| rand::rng().random_range(0..16).to_string()).collect()
}

fn sanitize_username(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-' { c } else { '_' })
        .take(32)
        .collect()
}

async fn find_or_provision(state: &AppState, username: &str, name: &str, email: &str) -> Result<i64, AppError> {
    if let Some(id) = sqlx::query_scalar::<_, i64>("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(&state.db)
        .await?
    {
        return Ok(id);
    }
    let pw = format!("sso-{}", rand::random::<u128>());
    let hash = auth::hash_password(&pw)?;
    let now = auth::now_iso();
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (username, password_hash, nickname, email, dept, position, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', '', 1, ?, ?) RETURNING id",
    )
    .bind(username)
    .bind(&hash)
    .bind(name)
    .bind(email)
    .bind(&now)
    .bind(&now)
    .fetch_one(&state.db)
    .await?;
    if let Ok(rid) = db::role_id(&state.db, "viewer").await {
        db::link_role(&state.db, id, rid).await.ok();
    }
    Ok(id)
}
