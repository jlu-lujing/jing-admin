use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{ok_empty, AppError, AppJson, ApiResponse};
use crate::models::{DeptInput, DeptNode};
use crate::state::AppState;

async fn fetch_all(pool: &crate::db::Db) -> Result<Vec<(i64, String, Option<i64>, i64)>, AppError> {
    let rows = sqlx::query("SELECT id, name, parent_id, sort FROM departments ORDER BY sort ASC, id ASC")
        .fetch_all(pool)
        .await?;
    let mut out = Vec::new();
    for r in rows {
        out.push((
            r.try_get("id")?,
            r.try_get("name")?,
            r.try_get("parent_id")?,
            r.try_get("sort")?,
        ));
    }
    Ok(out)
}

async fn build_tree(
    pool: &crate::db::Db,
) -> Result<Vec<DeptNode>, AppError> {
    let depts = fetch_all(pool).await?;
    let mut counts: Vec<(i64, String, i64)> = Vec::new();
    for (id, name, _, _) in &depts {
        let c: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE dept = ?")
            .bind(name)
            .fetch_one(pool)
            .await?;
        counts.push((*id, name.clone(), c));
    }
    let count_map: std::collections::HashMap<String, i64> =
        counts.into_iter().map(|(_, n, c)| (n, c)).collect();

    fn build(
        depts: &[(i64, String, Option<i64>, i64)],
        count_map: &std::collections::HashMap<String, i64>,
        parent: Option<i64>,
    ) -> Vec<DeptNode> {
        depts
            .iter()
            .filter(|(_, _, p, _)| *p == parent)
            .map(|(id, name, p, sort)| DeptNode {
                id: *id,
                name: name.clone(),
                parent_id: *p,
                sort: *sort,
                user_count: count_map.get(name).copied().unwrap_or(0),
                children: build(depts, count_map, Some(*id)),
            })
            .collect()
    }

    Ok(build(&depts, &count_map, None))
}

pub async fn tree(State(state): State<AppState>, user: AuthUser) -> AppJson<Vec<DeptNode>> {
    user.require("system:dept:list")?;
    let data = build_tree(&state.db).await?;
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(data) })))
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<DeptInput>,
) -> AppJson<DeptNode> {
    user.require("system:dept:create")?;
    let name = req.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 30 {
        return Err(AppError::BadRequest("部门名称需为 1-30 字符".into()));
    }
    if let Some(pid) = req.parent_id {
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM departments WHERE id = ?")
            .bind(pid)
            .fetch_one(&state.db)
            .await?;
        if exists == 0 {
            return Err(AppError::BadRequest("上级部门不存在".into()));
        }
    }
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM departments WHERE name = ?")
        .bind(&name)
        .fetch_one(&state.db)
        .await?;
    if exists > 0 {
        return Err(AppError::Conflict("部门名称已存在".into()));
    }
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO departments (name, parent_id, sort, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(&name)
    .bind(req.parent_id)
    .bind(req.sort.unwrap_or(0))
    .bind(crate::auth::now_iso())
    .fetch_one(&state.db)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse {
            code: 0,
            message: "创建成功".into(),
            data: Some(DeptNode {
                id,
                name,
                parent_id: req.parent_id,
                sort: req.sort.unwrap_or(0),
                user_count: 0,
                children: vec![],
            }),
        }),
    ))
}

/// 改名时级联更新 users.dept；换父级时做环检测
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
    Json(req): Json<DeptInput>,
) -> Result<axum::response::Response, AppError> {
    user.require("system:dept:update")?;
    let row = sqlx::query("SELECT name, parent_id FROM departments WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let old_name: String = row.try_get("name")?;
    let new_name = req.name.trim().to_string();
    if new_name.is_empty() || new_name.chars().count() > 30 {
        return Err(AppError::BadRequest("部门名称需为 1-30 字符".into()));
    }

    if let Some(pid) = req.parent_id {
        if pid == id {
            return Err(AppError::BadRequest("不能将部门挂到自己下面".into()));
        }
        // 环检测：沿新父级向上走，遇到自身则拒绝
        let mut cursor = Some(pid);
        for _ in 0..64 {
            let Some(c) = cursor else { break };
            if c == id {
                return Err(AppError::BadRequest("不允许形成循环引用".into()));
            }
            cursor = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT parent_id FROM departments WHERE id = ?",
            )
            .bind(c)
            .fetch_optional(&state.db)
            .await?
            .flatten();
        }
    }

    let dup: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM departments WHERE name = ? AND id != ?")
        .bind(&new_name)
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if dup > 0 {
        return Err(AppError::Conflict("部门名称已存在".into()));
    }

    sqlx::query("UPDATE departments SET name = ?, parent_id = ?, sort = ? WHERE id = ?")
        .bind(&new_name)
        .bind(req.parent_id)
        .bind(req.sort.unwrap_or(0))
        .bind(id)
        .execute(&state.db)
        .await?;

    if new_name != old_name {
        sqlx::query("UPDATE users SET dept = ? WHERE dept = ?")
            .bind(&new_name)
            .bind(&old_name)
            .execute(&state.db)
            .await?;
    }
    Ok(ok_empty())
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<i64>,
) -> Result<axum::response::Response, AppError> {
    user.require("system:dept:delete")?;
    let row = sqlx::query("SELECT name FROM departments WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let name: String = row.try_get("name")?;

    let children: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM departments WHERE parent_id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if children > 0 {
        return Err(AppError::Conflict("该部门仍有子部门，无法删除".into()));
    }
    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE dept = ?")
        .bind(&name)
        .fetch_one(&state.db)
        .await?;
    if users > 0 {
        return Err(AppError::Conflict(format!("仍有 {users} 名用户归属该部门")));
    }
    sqlx::query("DELETE FROM departments WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(ok_empty())
}
