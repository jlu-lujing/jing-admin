use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::{self, AuthUser};
use crate::error::{ok_empty, AppError, AppJson, ApiResponse};
use crate::models::{PageData, PageQuery, RoleOut, UpsertRoleReq};
use crate::state::AppState;

pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PageQuery>,
) -> AppJson<PageData<RoleOut>> {
    user.require("system:role:list")?;
    let keyword = q.keyword.unwrap_or_default();

    let rows = sqlx::query(
        "SELECT r.* FROM roles r
         WHERE (?1 = '' OR r.name LIKE '%'||?1||'%' OR r.code LIKE '%'||?1||'%')
         ORDER BY r.id ASC",
    )
    .bind(&keyword)
    .fetch_all(&state.db)
    .await?;

    let mut list = Vec::new();
    for r in rows {
        let id: i64 = r.try_get("id")?;
        let permissions = perms_of_role(&state.db, id).await?;
        let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_roles WHERE role_id = ?")
            .bind(id)
            .fetch_one(&state.db)
            .await?;
        list.push(RoleOut {
            id,
            name: r.try_get("name")?,
            code: r.try_get("code")?,
            description: r.try_get("description")?,
            status: r.try_get("status")?,
            permissions,
            user_count,
            data_scope: r.try_get("data_scope").unwrap_or_else(|_| "all".into()),
            rules_json: r.try_get("rules_json").ok().flatten(),
            created_at: r.try_get("created_at")?,
        });
    }
    let total = list.len() as i64;
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(PageData { list, total, page: 1, page_size: total.max(1) }),
        }),
    ))
}

pub async fn permissions(State(state): State<AppState>) -> AppJson<serde_json::Value> {
    let rows = sqlx::query("SELECT code, name, description FROM permissions ORDER BY id ASC")
        .fetch_all(&state.db)
        .await?;
    let list: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "code": r.try_get::<String, _>("code").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "description": r.try_get::<String, _>("description").unwrap_or_default(),
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::Value::Array(list)) })))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<UpsertRoleReq>,
) -> AppJson<RoleOut> {
    user.require("system:role:create")?;
    validate_code(&req.code)?;
    if req.name.trim().is_empty() {
        return Err(AppError::BadRequest("角色名称不能为空".into()));
    }
    validate_scope_rules(req.data_scope.as_deref(), req.rules_json.as_deref())?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles WHERE code = ? OR name = ?")
        .bind(&req.code)
        .bind(&req.name)
        .fetch_one(&state.db)
        .await?;
    if exists > 0 {
        return Err(AppError::Conflict("角色标识或名称已存在".into()));
    }

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO roles (name, code, description, status, created_at, data_scope, rules_json) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(req.name.trim())
    .bind(req.code.trim())
    .bind(req.description.trim())
    .bind(req.status.unwrap_or(1))
    .bind(auth::now_iso())
    .bind(req.data_scope.as_deref().unwrap_or("all"))
    .bind(req.rules_json.as_deref())
    .fetch_one(&state.db)
    .await?;
    set_perms(&state.db, id, &req.permissions).await?;
    let out = get_role_out(&state.db, id).await?;
    Ok((StatusCode::CREATED, Json(ApiResponse { code: 0, message: "创建成功".into(), data: Some(out) })))
}

pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    Json(req): Json<UpsertRoleReq>,
) -> AppJson<RoleOut> {
    user.require("system:role:update")?;
    let row = sqlx::query("SELECT code FROM roles WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let old_code: String = row.try_get("code")?;

    // super_admin 角色不允许改动，避免把系统锁死
    if old_code == "super_admin" {
        return Err(AppError::BadRequest("超级管理员角色不允许修改".into()));
    }

    let dup: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles WHERE (code = ? OR name = ?) AND id != ?")
        .bind(&req.code)
        .bind(&req.name)
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if dup > 0 {
        return Err(AppError::Conflict("角色标识或名称已存在".into()));
    }

    validate_scope_rules(req.data_scope.as_deref(), req.rules_json.as_deref())?;
    sqlx::query("UPDATE roles SET name = ?, code = ?, description = ?, status = ?, data_scope = COALESCE(?, data_scope), rules_json = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(req.code.trim())
        .bind(req.description.trim())
        .bind(req.status.unwrap_or(1))
        .bind(req.data_scope.as_deref())
        .bind(req.rules_json.as_deref())
        .bind(id)
        .execute(&state.db)
        .await?;
    set_perms(&state.db, id, &req.permissions).await?;
    let out = get_role_out(&state.db, id).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "更新成功".into(), data: Some(out) })))
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<axum::response::Response, AppError> {
    user.require("system:role:delete")?;
    let r = sqlx::query("SELECT code FROM roles WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let code: String = r.try_get("code").unwrap_or_default();
    if code == "super_admin" {
        return Err(AppError::BadRequest("超级管理员角色不允许删除".into()));
    }
    let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_roles WHERE role_id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if in_use > 0 {
        return Err(AppError::Conflict("该角色仍被用户使用，无法删除".into()));
    }
    sqlx::query("DELETE FROM roles WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(ok_empty())
}

pub fn validate_scope_rules(scope: Option<&str>, rules: Option<&str>) -> Result<(), AppError> {
    if let Some(sc) = scope {
        if !["all", "dept", "self"].contains(&sc) {
            return Err(AppError::BadRequest("dataScope 需为 all/dept/self".into()));
        }
    }
    if let Some(rj) = rules {
        if !rj.trim().is_empty() {
            let v: serde_json::Value =
                serde_json::from_str(rj).map_err(|_| AppError::BadRequest("rulesJson 非合法 JSON".into()))?;
            let arr = v.as_array().ok_or_else(|| AppError::BadRequest("rulesJson 需为数组".into()))?;
            for c in arr {
                let f = c.get("field").and_then(|x| x.as_str()).unwrap_or("");
                if !["status", "dept", "position"].contains(&f) {
                    return Err(AppError::BadRequest("规则字段限 status/dept/position".into()));
                }
            }
        }
    }
    Ok(())
}

fn validate_code(code: &str) -> Result<(), AppError> {
    let code = code.trim();
    if code.len() < 2 || code.len() > 32 || !code.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(AppError::BadRequest("角色标识需为 2-32 位小写字母/数字/下划线".into()));
    }
    Ok(())
}

async fn perms_of_role(pool: &crate::db::Db, role_id: i64) -> Result<Vec<String>, AppError> {
    Ok(sqlx::query(
        "SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?",
    )
    .bind(role_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| r.try_get("code").unwrap_or_default())
    .collect())
}

async fn set_perms(pool: &crate::db::Db, role_id: i64, codes: &[String]) -> Result<(), AppError> {
    sqlx::query("DELETE FROM role_permissions WHERE role_id = ?")
        .bind(role_id)
        .execute(pool)
        .await?;
    for c in codes {
        sqlx::query(
            "INSERT INTO role_permissions (role_id, permission_id)
             SELECT ?, id FROM permissions WHERE code = ?",
        )
        .bind(role_id)
        .bind(c)
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn get_role_out(pool: &crate::db::Db, id: i64) -> Result<RoleOut, AppError> {
    let r = sqlx::query("SELECT * FROM roles WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let permissions = perms_of_role(pool, id).await?;
    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_roles WHERE role_id = ?")
        .bind(id)
        .fetch_one(pool)
        .await?;
    Ok(RoleOut {
        id,
        name: r.try_get("name")?,
        code: r.try_get("code")?,
        description: r.try_get("description")?,
        status: r.try_get("status")?,
        permissions,
        user_count,
        data_scope: r.try_get("data_scope").unwrap_or_else(|_| "all".into()),
        rules_json: r.try_get("rules_json").ok().flatten(),
        created_at: r.try_get("created_at")?,
    })
}
