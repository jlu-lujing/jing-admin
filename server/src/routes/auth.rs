use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::{self, AuthUser};
use crate::error::{AppError, AppJson, ApiResponse};
use crate::models::{LoginOut, LoginReq, MeOut, RefreshReq, UpdateProfileReq};
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

const MAX_FAILS: u32 = 5;
const LOCK_SECS: i64 = 10 * 60;

static LOGIN_FAILS: OnceLock<Mutex<HashMap<String, (u32, i64)>>> = OnceLock::new();

fn fails_map() -> &'static Mutex<HashMap<String, (u32, i64)>> {
    LOGIN_FAILS.get_or_init(Default::default)
}

fn check_locked(username: &str) -> Result<(), AppError> {
    let map = fails_map().lock().unwrap();
    if let Some((count, first_ts)) = map.get(username) {
        if *count >= MAX_FAILS {
            let elapsed = chrono::Utc::now().timestamp() - first_ts;
            if elapsed < LOCK_SECS {
                let mins = ((LOCK_SECS - elapsed) / 60) + 1;
                return Err(AppError::TooMany(format!(
                    "失败次数过多，账号已锁定，请 {mins} 分钟后再试"
                )));
            }
        }
    }
    Ok(())
}

fn record_fail(username: &str) {
    let mut map = fails_map().lock().unwrap();
    let now = chrono::Utc::now().timestamp();
    match map.get_mut(username) {
        Some((count, first_ts)) if now - *first_ts < LOCK_SECS => *count += 1,
        _ => {
            map.insert(username.to_string(), (1, now));
        }
    }
}

fn clear_fails(username: &str) {
    fails_map().lock().unwrap().remove(username);
}

const ACCESS_TTL: i64 = 2 * 60 * 60;
const REFRESH_TTL: i64 = 7 * 24 * 60 * 60;

pub async fn login(
    State(state): State<AppState>,
    raw: axum::http::request::Parts,
    Json(req): Json<LoginReq>,
) -> AppJson<LoginOut> {
    if req.username.trim().is_empty() || req.password.is_empty() {
        return Err(AppError::BadRequest("用户名和密码不能为空".into()));
    }
    check_locked(&req.username)?;

    let row = sqlx::query(
        "SELECT id, username, password_hash, status, totp_enabled, totp_secret, last_login_ip, pwd_changed_at
         FROM users WHERE username = ? AND deleted_at IS NULL",
    )
    .bind(&req.username)
    .fetch_optional(&state.db)
    .await?;

    let ok = match &row {
        Some(r) => auth::verify_password(
            &req.password,
            &r.try_get::<String, _>("password_hash").unwrap_or_default(),
        ),
        None => false,
    };
    let Some(row) = row.filter(|_| ok) else {
        crate::metrics::login_fail();
        record_fail(&req.username);
        crate::audit::record(&state, None, &req.username, "登录失败", "用户名或密码错误", &raw, 401).await;
        return Err(AppError::BadRequest("用户名或密码错误".into()));
    };
    clear_fails(&req.username);

    // 两步验证
    if row.try_get::<i64, _>("totp_enabled").unwrap_or(0) == 1 {
        let secret: String = row.try_get("totp_secret").unwrap_or_default();
        match req.code.as_deref() {
            None => return Err(AppError::BadRequest("NEED_TOTP:请输入身份验证器 6 位动态码".into())),
            Some(c) if crate::totp::verify(&secret, c.trim()) => {}
            Some(_) => return Err(AppError::BadRequest("动态码错误".into())),
        }
    }
    crate::metrics::login_ok();

    let status: i64 = row.try_get("status")?;
    if status != 1 {
        return Err(AppError::Forbidden);
    }
    let id: i64 = row.try_get("id")?;
    let username: String = row.try_get("username")?;

    // 异地登录提醒（IP 段变化）
    let prev_ip: Option<String> = row.try_get("last_login_ip").ok().flatten();
    let cur_ip = raw
        .headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".into());
    let prefix_changed = match &prev_ip {
        Some(p) => {
            let a: Vec<&str> = p.split('.').take(2).collect();
            let b: Vec<&str> = cur_ip.split('.').take(2).collect();
            a.len() == 2 && b.len() == 2 && a != b
        }
        None => false,
    };

    sqlx::query("UPDATE users SET last_login = ?, last_login_ip = ? WHERE id = ?")
        .bind(auth::now_iso())
        .bind(&cur_ip)
        .bind(id)
        .execute(&state.db)
        .await?;

    if prefix_changed {
        crate::db::notify_user(
            &state.db,
            id,
            "异地登录提醒",
            &format!("检测到你从新的网络（{cur_ip}）登录，如非本人操作请立即修改密码"),
            "warning",
        )
        .await;
    }

    // 密码过期策略
    let expiry_days = crate::security::cfg_num(&state, "pwd_expiry_days", 0).await;
    let must_change = if expiry_days > 0 {
        let changed: Option<String> = row.try_get("pwd_changed_at").ok().flatten();
        match changed {
            None => true,
            Some(t) => {
                chrono::DateTime::parse_from_rfc3339(&t)
                    .map(|t| chrono::Utc::now() - t.with_timezone(&chrono::Utc) > chrono::Duration::days(expiry_days))
                    .unwrap_or(true)
            }
        }
    } else {
        false
    };

    let (access, access_jti) = auth::create_token(id, &username, "access", ACCESS_TTL)?;
    let (refresh, refresh_jti) = auth::create_token(id, &username, "refresh", REFRESH_TTL)?;
    let ip = raw
        .headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".into());
    let ua = raw
        .headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .chars()
        .take(160)
        .collect::<String>();
    auth::create_session(&state.db, id, &username, &access_jti, &refresh_jti, &ip, &ua, ACCESS_TTL).await;
    let user = me_snapshot(&state.db, id).await?;

    crate::audit::record(&state, Some(id), &username, "登录", "管理员登录系统", &raw, 200).await;

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(LoginOut {
                access_token: access,
                refresh_token: refresh,
                expires_in: ACCESS_TTL,
                user: MeOut { must_change_password: must_change, ..user },
            }),
        }),
    ))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshReq>,
) -> AppJson<LoginOut> {
    let claims = auth::verify_token(&req.refresh_token, "refresh")?;
    if let Some(old_jti) = &claims.jti {
        if auth::is_revoked(&state.db, old_jti).await? {
            return Err(AppError::TokenExpired);
        }
        // refresh token 轮换：旧会话作废
        auth::revoke_session_by_jti(&state.db, old_jti).await;
    }
    let (access, access_jti) = auth::create_token(claims.sub, &claims.username, "access", ACCESS_TTL)?;
    let (refresh, refresh_jti) = auth::create_token(claims.sub, &claims.username, "refresh", REFRESH_TTL)?;
    auth::create_session(&state.db, claims.sub, &claims.username, &access_jti, &refresh_jti, "", "", ACCESS_TTL).await;
    let user = me_snapshot(&state.db, claims.sub).await?;
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(LoginOut {
                access_token: access,
                refresh_token: refresh,
                expires_in: ACCESS_TTL,
                user: MeOut { must_change_password: user.must_change_password, ..user },
            }),
        }),
    ))
}

pub async fn me(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppJson<MeOut> {
    let out = me_snapshot(&state.db, user.id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(out) })))
}

pub async fn logout(
    State(state): State<AppState>,
    user: AuthUser,
    raw: axum::http::request::Parts,
) -> Result<axum::response::Response, AppError> {
    if let Some(jti) = &user.jti {
        auth::revoke_session_by_jti(&state.db, jti).await;
    }
    crate::audit::record(&state, Some(user.id), &user.username, "登出", "用户退出登录", &raw, 200).await;
    Ok(crate::error::ok_empty())
}

async fn me_snapshot(pool: &crate::db::Db, id: i64) -> Result<MeOut, AppError> {
    let auth_user = auth::load_user(pool, id).await?;
    let row = sqlx::query("SELECT nickname, email, phone, avatar, dept, position FROM users WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await?;
    let roles: Vec<String> = sqlx::query(
        "SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?",
    )
    .bind(id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| r.try_get("code").unwrap_or_default())
    .collect();

    Ok(MeOut {
        id,
        username: auth_user.username,
        nickname: row.try_get("nickname")?,
        email: row.try_get("email")?,
        phone: row.try_get("phone")?,
        avatar: row.try_get("avatar")?,
        dept: row.try_get("dept")?,
        position: row.try_get("position")?,
        roles,
        permissions: auth_user.permissions,
        must_change_password: false,
    })
}

pub async fn update_profile(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<UpdateProfileReq>,
) -> AppJson<MeOut> {
    if req.nickname.trim().is_empty() {
        return Err(AppError::BadRequest("昵称不能为空".into()));
    }
    sqlx::query("UPDATE users SET nickname = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?")
        .bind(req.nickname.trim())
        .bind(req.email.trim())
        .bind(req.phone.trim())
        .bind(auth::now_iso())
        .bind(user.id)
        .execute(&state.db)
        .await?;
    let out = me_snapshot(&state.db, user.id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(out) })))
}

pub async fn change_password(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<crate::models::ChangePasswordReq>,
) -> AppJson<()> {
    if req.new_password.len() < 6 {
        return Err(AppError::BadRequest("新密码至少 6 位".into()));
    }
    let hash: String = sqlx::query("SELECT password_hash FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?
        .try_get("password_hash")?;
    if !auth::verify_password(&req.old_password, &hash) {
        return Err(AppError::BadRequest("原密码错误".into()));
    }
    crate::security::check_password_policy(&state, Some(user.id), &req.new_password).await?;
    let new_hash = auth::hash_password(&req.new_password)?;
    crate::security::record_password(&state, user.id, &hash).await;
    // 改密不吊销当前会话，其他设备需重新登录（此处保守处理：仅提示）
    sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(new_hash)
        .bind(auth::now_iso())
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: None })))
}
