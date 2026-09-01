use sha1::{Digest, Sha1};

use crate::auth;
use crate::error::AppError;
use crate::state::AppState;

/* ============ 审计哈希链 ============ */
pub fn audit_hash(prev: &str, username: &str, action: &str, detail: &str, created: &str) -> String {
    let mut h = Sha1::new();
    h.update(auth::jwt_secret_str().as_bytes());
    h.update(prev.as_bytes());
    h.update(username.as_bytes());
    h.update(action.as_bytes());
    h.update(detail.as_bytes());
    h.update(created.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// 带哈希链写入：链尾在事务内读取（SQLite 单写者天然串行；PG 用 advisory lock），无跨库全局状态
#[allow(clippy::too_many_arguments)]
pub async fn audit_insert(
    db: &crate::db::Db,
    user_id: Option<i64>,
    username: &str,
    action: &str,
    detail: &str,
    method: &str,
    path: &str,
    status_code: i64,
    ip: &str,
    user_agent: &str,
) {
    let created = auth::now_iso();
    for attempt in 0..3 {
        let res = (async {
            let mut tx = db.begin().await.map_err(|e| e.to_string())?;
            let prev: String = sqlx::query_scalar(
                "SELECT COALESCE(MAX(hash), 'GENESIS') FROM (SELECT hash FROM audit_logs WHERE hash IS NOT NULL AND hash != '' ORDER BY id DESC LIMIT 1)",
            )
            .fetch_optional(&mut *tx)
            .await
            .map(|v| v.unwrap_or_else(|| "GENESIS".into()))
            .map_err(|e| e.to_string())?;
            let hash = audit_hash(&prev, username, action, detail, &created);
            sqlx::query(
                "INSERT INTO audit_logs (user_id, username, action, detail, method, path, status_code, ip, user_agent, created_at, hash, prev_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(user_id)
            .bind(username)
            .bind(action)
            .bind(detail)
            .bind(method)
            .bind(path)
            .bind(status_code)
            .bind(ip)
            .bind(user_agent)
            .bind(&created)
            .bind(&hash)
            .bind(&prev)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            tx.commit().await.map_err(|e| e.to_string())
        })
        .await;
        match res {
            Ok(_) => return,
            Err(e) => {
                tracing::debug!("审计链写入重试({attempt}): {e}");
                tokio::time::sleep(std::time::Duration::from_millis(10 * (attempt + 1))).await;
            }
        }
    }
    tracing::warn!("审计链写入最终失败: {username} {action}");
}

/// 完整性校验：返回校验链长 / 断裂点 / 遗留未签名行数
pub async fn verify_chain(db: &crate::db::Db) -> serde_json::Value {
    use futures::TryStreamExt;
    let rows: Vec<(i64, String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT id, username, action, detail, created_at, COALESCE(hash,''), COALESCE(prev_hash,'')
         FROM audit_logs WHERE hash IS NOT NULL AND hash != '' ORDER BY id ASC LIMIT 20000",
    )
    .fetch(db)
    .map_ok(|(a, b, c, d, e, f, g)| (a, b, c, d, e, f, g))
    .try_collect()
    .await
    .unwrap_or_default();

    let unsigned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE hash IS NULL OR hash = ''")
        .fetch_one(db)
        .await
        .unwrap_or(0);

    let mut prev = rows.first().map(|r| r.6.clone()).unwrap_or_default();
    let mut broken: Option<i64> = None;
    for (id, username, action, detail, created, hash, prev_hash) in &rows {
        if *prev_hash != prev {
            broken = Some(*id);
            break;
        }
        if audit_hash(prev_hash, username, action, detail, created) != *hash {
            broken = Some(*id);
            break;
        }
        prev = hash.clone();
    }

    serde_json::json!({
        "checked": rows.len(),
        "valid": broken.is_none(),
        "brokenAt": broken,
        "legacyUnsigned": unsigned,
    })
}

/* ============ 密码策略 ============ */
pub async fn check_password_policy(state: &AppState, user_id: Option<i64>, new_pw: &str) -> Result<(), AppError> {
    let min: usize = cfg_num(state, "pwd_min_length", 6).await as usize;
    if new_pw.len() < min {
        return Err(AppError::BadRequest(format!("密码至少 {min} 位")));
    }
    let letters = new_pw.chars().any(|c| c.is_ascii_alphabetic());
    let digits = new_pw.chars().any(|c| c.is_ascii_digit());
    if min >= 6 && !(letters && digits) {
        return Err(AppError::BadRequest("密码需同时包含字母和数字".into()));
    }
    if let Some(uid) = user_id {
        let hist_n = cfg_num(state, "pwd_history_count", 0).await;
        if hist_n > 0 {
            let rows = sqlx::query_scalar::<_, String>(
                "SELECT hash FROM pwd_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            )
            .bind(uid)
            .bind(hist_n)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();
            for h in rows {
                if auth::verify_password(new_pw, &h) {
                    return Err(AppError::BadRequest("不能与最近使用过的密码相同".into()));
                }
            }
        }
    }
    Ok(())
}

/// 记录旧密码进历史（改密前调用）并打时间戳
pub async fn record_password(state: &AppState, user_id: i64, old_hash: &str) {
    sqlx::query("INSERT INTO pwd_history (user_id, hash, created_at) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind(old_hash)
        .bind(auth::now_iso())
        .execute(&state.db)
        .await
        .ok();
    sqlx::query("UPDATE users SET pwd_changed_at = ? WHERE id = ?")
        .bind(auth::now_iso())
        .bind(user_id)
        .execute(&state.db)
        .await
        .ok();
}

pub async fn cfg_num(state: &AppState, key: &str, default: i64) -> i64 {
    sqlx::query_scalar::<_, String>("SELECT value FROM configs WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/* ============ 限流（令牌桶） ============ */
pub fn take_token(state: &AppState, key: &str, per_min: i64) -> bool {
    if per_min <= 0 {
        return true;
    }
    let now = std::time::UNIX_EPOCH.elapsed().unwrap().as_secs_f64();
    let mut g = state.rate.lock().unwrap();
    let (tokens, last) = g.entry(key.to_string()).or_insert((per_min as f64, now));
    *tokens = (per_min as f64).min(*tokens + (now - *last) * (per_min as f64 / 60.0));
    *last = now;
    if *tokens >= 1.0 {
        *tokens -= 1.0;
        true
    } else {
        false
    }
}

/* ============ 敏感数据脱敏 ============ */
pub fn mask_phone(p: &str) -> String {
    if p.len() < 7 {
        return p.chars().map(|c| if c.is_ascii_digit() { '*' } else { c }).collect();
    }
    let chars: Vec<char> = p.chars().collect();
    let mut out = String::new();
    out.extend(&chars[..3]);
    out.push_str("****");
    out.extend(chars[chars.len() - 4..].iter());
    out
}

pub fn mask_email(e: &str) -> String {
    match e.split_once('@') {
        Some((name, domain)) => {
            let keep: String = name.chars().take(2).collect();
            format!("{keep}***@{domain}")
        }
        None => e.to_string(),
    }
}
