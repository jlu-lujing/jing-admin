use argon2::password_hash::{SaltString, PasswordHasher, PasswordVerifier, PasswordHash};
use argon2::Argon2;
use rand_core::OsRng;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::LazyLock;

use crate::error::AppError;
use crate::state::AppState;

pub static ALL_PERMISSIONS: LazyLock<Vec<(&str, &str, &str)>> = LazyLock::new(|| {
    vec![
        ("dashboard", "数据看板", "查看仪表盘"),
        ("system:user:list", "用户列表", "查看用户列表"),
        ("system:user:create", "新增用户", "创建用户"),
        ("system:user:update", "编辑用户", "修改用户信息"),
        ("system:user:delete", "删除用户", "删除用户"),
        ("system:role:list", "角色列表", "查看角色列表"),
        ("system:role:create", "新增角色", "创建角色"),
        ("system:role:update", "编辑角色", "修改角色与权限分配"),
        ("system:role:delete", "删除角色", "删除角色"),
        ("system:audit:list", "审计日志", "查看操作日志"),
        ("system:settings", "系统设置", "修改个人设置"),
    ]
});

/// 新版本新增的权限码（老库通过 backfill 增量补种）
pub static EXTRA_PERMISSIONS: &[(&str, &str, &str)] = &[
    ("system:dept:list", "部门列表", "查看部门树"),
    ("system:dept:create", "新增部门", "创建部门"),
    ("system:dept:update", "编辑部门", "修改部门"),
    ("system:dept:delete", "删除部门", "删除部门"),
    ("system:session:list", "在线会话", "查看在线设备与会话"),
    ("system:session:revoke", "强制下线", "踢下线其他会话"),
    ("system:config:list", "配置查看", "查看系统配置"),
    ("system:config:update", "配置修改", "修改系统配置"),
    ("system:dict:update", "字典维护", "维护数据字典"),
    ("system:file:list", "文件列表", "查看文件中心"),
    ("system:file:upload", "文件上传", "上传/删除文件"),
    ("system:approval:list", "审批列表", "查看权限申请"),
    ("system:approval:handle", "审批处理", "通过/驳回申请"),
    ("system:task:list", "任务查看", "查看定时任务"),
    ("system:task:run", "任务执行", "手动触发任务"),
    ("system:key:list", "密钥查看", "查看 API 密钥"),
    ("system:key:create", "密钥创建", "创建/吊销 API 密钥"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: i64,
    pub username: String,
    pub exp: i64,
    pub iat: i64,
    pub typ: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jti: Option<String>,
}

/// JWT 密钥的字符串形态（用于 HMAC 域分离前缀）
pub fn jwt_secret_str() -> String {
    String::from_utf8_lossy(&jwt_secret()).into_owned()
}

pub fn jwt_secret() -> Vec<u8> {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "jing-admin-dev-secret-change-in-production".to_string())
        .into_bytes()
}

/// 生成带 jti 的 token，返回 (token, jti)
pub fn create_token(user_id: i64, username: &str, typ: &str, ttl_secs: i64) -> Result<(String, String), AppError> {
    use rand::Rng;
    let now = Utc::now();
    let jti: String = (0..8).map(|_| rand::rng().random_range(0..16).to_string()).collect();
    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        iat: now.timestamp(),
        exp: (now + chrono::Duration::seconds(ttl_secs)).timestamp(),
        typ: typ.to_string(),
        jti: Some(jti.clone()),
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(&jwt_secret()),
    )
    .map_err(|e| AppError::Internal(format!("token 生成失败: {e}")))?;
    Ok((token, jti))
}

pub fn expires_at_iso(ttl_secs: i64) -> String {
    (Utc::now() + chrono::Duration::seconds(ttl_secs)).to_rfc3339()
}

pub fn verify_token(token: &str, expected_typ: &str) -> Result<Claims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 0;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&jwt_secret()),
        &validation,
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AppError::TokenExpired,
        _ => AppError::Unauthorized,
    })?;
    if data.claims.typ != expected_typ {
        return Err(AppError::Unauthorized);
    }
    Ok(data.claims)
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("密码哈希失败: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

/// 已认证用户，从 Authorization: Bearer <token> 解析并加载权限
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub permissions: Vec<String>,
    pub jti: Option<String>,
    pub tenant_id: i64,
}

impl AuthUser {
    pub fn has(&self, perm: &str) -> bool {
        self.permissions.iter().any(|p| p == perm)
    }

    pub fn require(&self, perm: &str) -> Result<(), AppError> {
        if self.has(perm) {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        if let Some(key) = parts
            .headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
        {
            // API Key 只读：仅放行 GET/HEAD
            if parts.method != axum::http::Method::GET && parts.method != axum::http::Method::HEAD {
                return Err(AppError::Forbidden);
            }
            let uid = crate::routes::keys::lookup(state, key)
                .await
                .ok_or(AppError::Unauthorized)?;
            return load_user(&state.db, uid).await;
        }
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;
        let claims = verify_token(token, "access")?;
        if let Some(jti) = &claims.jti {
            if is_revoked(&state.db, jti).await? {
                return Err(AppError::TokenExpired);
            }
        }
        let mut user = load_user(&state.db, claims.sub).await?;
        user.jti = claims.jti;
        Ok(user)
    }
}

/// 该 jti（或其同会话的 refresh_jti）是否已被吊销
pub async fn is_revoked(pool: &crate::db::Db, jti: &str) -> Result<bool, AppError> {
    let v: Option<i64> = sqlx::query_scalar(
        "SELECT revoked FROM sessions WHERE jti = ? OR refresh_jti = ? LIMIT 1",
    )
    .bind(jti)
    .bind(jti)
    .fetch_optional(pool)
    .await?;
    Ok(v == Some(1))
}

/// 记录一次登录会话
#[allow(clippy::too_many_arguments)]
pub async fn create_session(
    pool: &crate::db::Db,
    user_id: i64,
    username: &str,
    jti: &str,
    refresh_jti: &str,
    ip: &str,
    user_agent: &str,
    access_ttl: i64,
) {
    let res = sqlx::query(
        "INSERT INTO sessions (user_id, jti, refresh_jti, username, ip, user_agent, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT (jti) DO NOTHING",
    )
    .bind(user_id)
    .bind(jti)
    .bind(refresh_jti)
    .bind(username)
    .bind(ip)
    .bind(user_agent)
    .bind(now_iso())
    .bind(expires_at_iso(access_ttl))
    .execute(pool)
    .await;
    if let Err(e) = res {
        tracing::warn!("会话记录写入失败: {e}");
    }
}

/// 吊销一个会话（同时使 access/refresh 失效）
pub async fn revoke_session_by_jti(pool: &crate::db::Db, jti: &str) {
    let _ = sqlx::query("UPDATE sessions SET revoked = 1 WHERE jti = ? OR refresh_jti = ?")
        .bind(jti)
        .bind(jti)
        .execute(pool)
        .await;
}

pub async fn load_user(pool: &crate::db::Db, user_id: i64) -> Result<AuthUser, AppError> {
    let row = sqlx::query("SELECT id, username, status, tenant_id FROM users WHERE id = ? AND deleted_at IS NULL")
        .bind(user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::Unauthorized)?;
    if row.try_get::<i64, _>("status")? != 1 {
        return Err(AppError::Forbidden);
    }
    let username: String = row.try_get("username")?;

    let perms = sqlx::query(
        "SELECT DISTINCT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN user_roles ur ON ur.role_id = rp.role_id
         JOIN roles r ON r.id = ur.role_id AND r.status = 1
         WHERE ur.user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| r.try_get::<String, _>("code").unwrap_or_default())
    .collect();

    Ok(AuthUser {
        id: user_id,
        username,
        permissions: perms,
        jti: None,
        tenant_id: row.try_get("tenant_id").unwrap_or(1),
    })
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn days_ago_iso(days: i64) -> String {
    (Utc::now() - chrono::Duration::days(days)).to_rfc3339()
}

pub fn rand_time_within_days(days: i64) -> DateTime<Utc> {
    use rand::Rng;
    let offset = rand::rng().random_range(0..days * 86400);
    Utc::now() - chrono::Duration::seconds(offset as i64)
}
