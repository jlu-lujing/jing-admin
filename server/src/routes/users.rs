use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth;
use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::error::ok_empty;
use crate::models::{CreateUserReq, ImportResult, ImportUsersReq, PageData, PageQuery, UpdateUserReq, UserOut};
use crate::state::AppState;
use axum::response::{IntoResponse, Response};

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PageQuery>,
) -> AppJson<PageData<UserOut>> {
    user.require("system:user:list")?;
    let (offset, limit) = q.offset_limit();
    let keyword = q.keyword.unwrap_or_default();
    let dept = q.dept.unwrap_or_default();
    let status = q.status;

    // 数据权限：all / dept / self（取角色并集）
    let scopes: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT r.data_scope FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let scope_mode = if scopes.is_empty() || scopes.iter().any(|s| s == "all") {
        "all"
    } else if scopes.iter().any(|s| s == "dept") {
        "dept"
    } else {
        "self"
    };
    let my_dept: String = sqlx::query_scalar::<_, String>("SELECT dept FROM users WHERE id = ?")
        .bind(user.id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_default();

    // ABAC 规则（roles.rules_json 简易 conjunction，字段白名单）
    let rules: Vec<String> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT rules_json FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .flatten()
    .collect();
    let mut abac_sql = String::new();
    let mut abac_binds: Vec<String> = Vec::new();
    let mut idx = 8usize; // 绑定顺序: ?1 kw ?2 dept ?3 status ?4 mode ?5 mydept ?6 self ?7 tenant ?8.. abac
    for r in &rules {
        if let Ok(v) = serde_json::from_str::<Vec<serde_json::Value>>(r) {
            for cond in v {
                let field = cond.get("field").and_then(|f| f.as_str()).unwrap_or("");
                let eq = cond.get("eq").and_then(|f| f.as_str()).unwrap_or("");
                let col = match field {
                    "status" => "u.status",
                    "dept" => "u.dept",
                    "position" => "u.position",
                    _ => continue,
                };
                let val = eq.replace("{self.dept}", &my_dept).replace("{self.username}", &user.username);
                abac_sql.push_str(&format!(" AND {col} = ?{idx}"));
                abac_binds.push(val);
                idx += 1;
            }
        }
    }
    let limit_ph = format!("?{idx}");
    let offset_ph = format!("?{}", idx + 1);

    let where_sql = String::from(
        " WHERE u.deleted_at IS NULL
           AND (?1 = '' OR u.username LIKE '%'||?1||'%' OR u.nickname LIKE '%'||?1||'%' OR u.email LIKE '%'||?1||'%')
           AND (?2 = '' OR u.dept = ?2)
           AND (?3 < 0 OR u.status = ?3)
           AND (?4 = 'all' OR (?4 = 'dept' AND u.dept = ?5) OR (?4 = 'self' AND u.id = ?6))
           AND u.tenant_id = ?7",
    ) + &abac_sql;
    let status_val = status.unwrap_or(-1);

    let count_sql = format!("SELECT COUNT(*) FROM users u{where_sql}");
    let mut qb = sqlx::query_scalar::<_, i64>(&count_sql)
        .bind(&keyword)
        .bind(&dept)
        .bind(status_val)
        .bind(scope_mode)
        .bind(&my_dept)
        .bind(user.id)
        .bind(user.tenant_id);
    for b in abac_binds.clone() {
        qb = qb.bind(b);
    }
    let total: i64 = qb.fetch_one(&state.db).await?;

    let sort_field = match q.sort.as_deref() {
        Some("username") => "u.username",
        Some("nickname") => "u.nickname",
        Some("dept") => "u.dept",
        Some("status") => "u.status",
        Some("createdAt") => "u.created_at",
        _ => "u.id",
    };
    let sort_dir = if q.order.as_deref() == Some("asc") { "ASC" } else { "DESC" };
    let rows_sql = format!("SELECT u.* FROM users u{where_sql} ORDER BY {sort_field} {sort_dir}, u.id DESC LIMIT {limit_ph} OFFSET {offset_ph}");
    let mut rb = sqlx::query(&rows_sql)
        .bind(&keyword)
        .bind(&dept)
        .bind(status_val)
        .bind(scope_mode)
        .bind(&my_dept)
        .bind(user.id)
        .bind(user.tenant_id);
    for b in abac_binds {
        rb = rb.bind(b);
    }
    rb = rb.bind(limit).bind(offset);
    let rows = rb.fetch_all(&state.db).await?;

    let can_private = user.has("system:user:private");
    let mut list = Vec::with_capacity(rows.len());
    for r in rows {
        let id: i64 = r.try_get("id")?;
        let roles: Vec<String> = sqlx::query(
            "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?",
        )
        .bind(id)
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(|x| x.try_get("name").unwrap_or_default())
        .collect();
        let is_self = id == user.id;
        list.push(UserOut {
            id,
            username: r.try_get("username")?,
            nickname: r.try_get("nickname")?,
            email: {
                let e: String = r.try_get("email")?;
                if can_private || is_self { e } else { crate::security::mask_email(&e) }
            },
            phone: {
                let p: String = r.try_get("phone")?;
                if can_private || is_self { p } else { crate::security::mask_phone(&p) }
            },
            dept: r.try_get("dept")?,
            position: r.try_get("position")?,
            status: r.try_get("status")?,
            roles,
            last_login: r.try_get("last_login")?,
            created_at: r.try_get("created_at")?,
        });
    }

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(PageData {
                list,
                total,
                page: (offset / limit) + 1,
                page_size: limit,
            }),
        }),
    ))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateUserReq>,
) -> AppJson<UserOut> {
    user.require("system:user:create")?;
    validate_username(&req.username)?;
    if req.password.len() < 6 {
        return Err(AppError::BadRequest("密码至少 6 位".into()));
    }

    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = ?")
        .bind(&req.username)
        .fetch_one(&state.db)
        .await?;
    if exists > 0 {
        return Err(AppError::Conflict("用户名已存在".into()));
    }
    crate::security::check_password_policy(&state, None, &req.password).await?;

    let hash = auth::hash_password(&req.password)?;
    let now = auth::now_iso();
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (username, password_hash, nickname, email, phone, dept, position, status, created_at, updated_at, tenant_id, pwd_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(req.username.trim())
    .bind(&hash)
    .bind(req.nickname.trim())
    .bind(req.email.trim())
    .bind(req.phone.trim())
    .bind(req.dept.trim())
    .bind(req.position.trim())
    .bind(req.status.unwrap_or(1))
    .bind(&now)
    .bind(&now)
    .bind(user.tenant_id)
    .bind(&now)
    .fetch_one(&state.db)
    .await?;

    assign_roles(&state.db, id, &req.roles).await?;
    crate::db::broadcast(
        &state.db,
        "新成员加入",
        &format!("{}（@{}）已加入 {}", req.nickname, req.username, req.dept),
        "info",
    )
    .await;
    let out = get_user_out(&state.db, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "创建成功".into(), data: Some(out) })))
}

const IMPORT_DEFAULT_PASSWORD: &str = "User@12345";

fn csv_escape(v: &str) -> String {
    if v.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v.to_string()
    }
}

pub async fn export(State(state): State<AppState>, user: AuthUser) -> Result<Response, AppError> {
    user.require("system:user:list")?;
    let rows = sqlx::query("SELECT * FROM users ORDER BY id ASC")
        .fetch_all(&state.db)
        .await?;
    let mut lines = vec!["username,nickname,email,phone,dept,position,status".to_string()];
    for r in rows {
        let username: String = r.try_get("username")?;
        let nickname: String = r.try_get("nickname")?;
        let email: String = r.try_get("email")?;
        let phone: String = r.try_get("phone")?;
        let dept: String = r.try_get("dept")?;
        let position: String = r.try_get("position")?;
        let status: i64 = r.try_get("status")?;
        lines.push(vec![username, nickname, email, phone, dept, position, status.to_string()]
            .iter()
            .map(|v| csv_escape(v))
            .collect::<Vec<_>>()
            .join(","));
    }
    let body = format!("\u{feff}{}", lines.join("\n"));
    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                axum::http::header::CONTENT_DISPOSITION,
                "attachment; filename=\"users.csv\"",
            ),
        ],
        body,
    )
        .into_response())
}

pub async fn import(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<ImportUsersReq>,
) -> AppJson<ImportResult> {
    user.require("system:user:create")?;
    if req.rows.is_empty() {
        return Err(AppError::BadRequest("导入行为空".into()));
    }
    if req.rows.len() > 500 {
        return Err(AppError::BadRequest("单次最多导入 500 行".into()));
    }
    let hash = auth::hash_password(IMPORT_DEFAULT_PASSWORD)?;
    let now = auth::now_iso();
    let mut imported = 0i64;
    let mut skipped = 0i64;
    let mut errors = Vec::new();

    for (i, row) in req.rows.iter().enumerate() {
        let username = row.username.trim().to_string();
        if validate_username(&username).is_err() {
            skipped += 1;
            errors.push(format!("第 {} 行: 用户名 {} 不合法", i + 1, username));
            continue;
        }
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = ?")
            .bind(&username)
            .fetch_one(&state.db)
            .await?;
        if exists > 0 {
            skipped += 1;
            errors.push(format!("第 {} 行: 用户 {} 已存在", i + 1, username));
            continue;
        }
        sqlx::query(
            "INSERT INTO users (username, password_hash, nickname, email, phone, dept, position, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        )
        .bind(&username)
        .bind(&hash)
        .bind(row.nickname.trim())
        .bind(row.email.trim())
        .bind(row.phone.trim())
        .bind(row.dept.trim())
        .bind(row.position.trim())
        .bind(&now)
        .bind(&now)
        .execute(&state.db)
        .await?;
        imported += 1;
    }

    if imported > 0 {
        crate::db::broadcast(
            &state.db,
            "批量导入完成",
            &format!("成功导入 {imported} 名新用户，初始密码见导入说明"),
            "update",
        )
        .await;
    }

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(ImportResult { imported, skipped, errors }),
        }),
    ))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    Json(req): Json<UpdateUserReq>,
) -> AppJson<UserOut> {
    user.require("system:user:update")?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE id = ? AND deleted_at IS NULL")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if exists == 0 {
        return Err(AppError::NotFound);
    }
    if id == user.id && req.status == Some(0) {
        return Err(AppError::BadRequest("不能禁用当前登录账号".into()));
    }

    let now = auth::now_iso();
    if let Some(v) = req.nickname {
        sqlx::query("UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?")
            .bind(v.trim()).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(v) = req.email {
        sqlx::query("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
            .bind(v.trim()).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(v) = req.phone {
        sqlx::query("UPDATE users SET phone = ?, updated_at = ? WHERE id = ?")
            .bind(v.trim()).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(v) = req.dept {
        sqlx::query("UPDATE users SET dept = ?, updated_at = ? WHERE id = ?")
            .bind(v.trim()).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(v) = req.position {
        sqlx::query("UPDATE users SET position = ?, updated_at = ? WHERE id = ?")
            .bind(v.trim()).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(v) = req.status {
        sqlx::query("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(&state.db).await?;
    }
    if let Some(pw) = req.password {
        crate::security::check_password_policy(&state, Some(id), &pw).await?;
        let old_hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = ?")
            .bind(id)
            .fetch_one(&state.db)
            .await?;
        let hash = auth::hash_password(&pw)?;
        sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
            .bind(hash).bind(&now).bind(id).execute(&state.db).await?;
        crate::security::record_password(&state, id, &old_hash).await;
    }
    if let Some(tid) = req.tenant_id {
        user.require("system:config:update")?;
        sqlx::query("UPDATE users SET tenant_id = ? WHERE id = ?")
            .bind(tid)
            .bind(id)
            .execute(&state.db)
            .await?;
    }
    if let Some(roles) = req.roles {
        assign_roles(&state.db, id, &roles).await?;
    }

    let out = get_user_out(&state.db, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "更新成功".into(), data: Some(out) })))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    user.require("system:user:delete")?;
    if id == user.id {
        return Err(AppError::BadRequest("不能删除当前登录账号".into()));
    }
    let n = sqlx::query("UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(auth::now_iso())
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(ok_empty())
}

pub async fn trash(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppJson<Vec<UserOut>> {
    user.require("system:user:list")?;
    let rows = sqlx::query("SELECT * FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    let can_private = user.has("system:user:private");
    let mut list = Vec::with_capacity(rows.len());
    for r in rows {
        let id: i64 = r.try_get("id")?;
        list.push(get_user_out(&state.db, id).await?);
    }
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(list) })))
}

pub async fn restore(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    user.require("system:user:update")?;
    let n = sqlx::query("UPDATE users SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(ok_empty())
}

/// 彻底删除：?purge=1
pub async fn purge(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    user.require("system:user:delete")?;
    let n = sqlx::query("DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    Ok(ok_empty())
}

fn validate_username(name: &str) -> Result<(), AppError> {
    let name = name.trim();
    if name.len() < 3 || name.len() > 32 {
        return Err(AppError::BadRequest("用户名长度需在 3-32 之间".into()));
    }
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-') {
        return Err(AppError::BadRequest("用户名仅支持小写字母、数字、下划线和短横线".into()));
    }
    Ok(())
}

async fn assign_roles(pool: &crate::db::Db, user_id: i64, roles: &[i64]) -> Result<(), AppError> {
    sqlx::query("DELETE FROM user_roles WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await?;
    for rid in roles {
        sqlx::query("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)")
            .bind(user_id)
            .bind(rid)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub(crate) async fn get_user_out(pool: &crate::db::Db, id: i64) -> Result<UserOut, AppError> {
    let r = sqlx::query("SELECT * FROM users WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let roles: Vec<String> = sqlx::query(
        "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?",
    )
    .bind(id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|x| x.try_get("name").unwrap_or_default())
    .collect();
    Ok(UserOut {
        id,
        username: r.try_get("username")?,
        nickname: r.try_get("nickname")?,
        email: r.try_get("email")?,
        phone: r.try_get("phone")?,
        dept: r.try_get("dept")?,
        position: r.try_get("position")?,
        status: r.try_get("status")?,
        roles,
        last_login: r.try_get("last_login")?,
        created_at: r.try_get("created_at")?,
    })
}
