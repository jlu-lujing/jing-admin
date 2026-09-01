use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppError, AppJson, ApiResponse};
use crate::state::AppState;

pub const TASKS: [(&str, &str, i64); 3] = [
    ("audit_retention", "审计日志保留清理", 86400),
    ("stats_snapshot", "统计快照（写入配置）", 86400),
    ("backup_db", "数据库备份", 86400),
];

pub async fn run_task(state: &AppState, task_id: &str) -> (bool, String, i64) {
    let t0 = std::time::Instant::now();
    let result: Result<String, String> = match task_id {
        "audit_retention" => (async {
            let days: i64 = sqlx::query_scalar::<_, String>("SELECT value FROM configs WHERE key = 'audit_retention_days'")
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            if days < 7 {
                return Ok("未启用（保留天数 < 7）".into());
            }
            let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
            let n = sqlx::query("DELETE FROM audit_logs WHERE created_at < ?")
                .bind(cutoff.to_rfc3339())
                .execute(&state.db)
                .await
                .map_err(|e| e.to_string())?
                .rows_affected();
            Ok(format!("清理 {n} 条（保留 {days} 天）"))
        })
            .await,
        "stats_snapshot" => (async {
            let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL").fetch_one(&state.db).await.unwrap_or(0);
            let audits: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs").fetch_one(&state.db).await.unwrap_or(0);
            let snapshot = serde_json::json!({ "users": users, "auditLogs": audits, "at": crate::auth::now_iso() });
            sqlx::query(
                "INSERT INTO configs (key, value, label, is_public, updated_at) VALUES ('stat_snapshot', ?, '最近统计快照', 0, ?)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            )
            .bind(snapshot.to_string())
            .bind(crate::auth::now_iso())
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
            Ok(snapshot.to_string())
        })
            .await,
        "backup_db" => (async {
            std::fs::create_dir_all("data/backups").map_err(|e| e.to_string())?;
            let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
            #[cfg(feature = "sqlite")]
            {
                let dest = format!("data/backups/jing-{stamp}.db");
                sqlx::raw_sql(&format!("VACUUM INTO '{dest}'"))
                    .execute(&state.db)
                    .await
                    .map_err(|e| e.to_string())?;
                let keep = crate::security::cfg_num(&state, "backup_keep", 5).await.max(1) as usize;
                let mut entries: Vec<_> = std::fs::read_dir("data/backups")
                    .map_err(|e| e.to_string())?
                    .filter_map(|e| e.ok().map(|e| e.path()))
                    .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("jing-")).unwrap_or(false))
                    .collect();
                entries.sort();
                while entries.len() > keep {
                    std::fs::remove_file(&entries.remove(0)).ok();
                }
                Ok(format!("备份完成: {dest}（保留 {keep} 份）"))
            }
            #[cfg(not(feature = "sqlite"))]
            {
                let _ = stamp;
                Ok("PostgreSQL 请使用 pg_dump 定时任务（见 README 备份章节）".into())
            }
        })
            .await,
        _ => Err("未知任务".into()),
    };
    let (ok, detail) = match result {
        Ok(d) => (true, d),
        Err(e) => (false, e),
    };
    let dur = t0.elapsed().as_millis() as i64;
    sqlx::query("INSERT INTO task_runs (task_id, ok, detail, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(task_id)
        .bind(ok as i64)
        .bind(&detail)
        .bind(dur)
        .bind(crate::auth::now_iso())
        .execute(&state.db)
        .await
        .ok();
    (ok, detail, dur)
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppJson<serde_json::Value> {
    user.require("system:task:list")?;
    let rows = sqlx::query("SELECT task_id, ok, detail, duration_ms, created_at FROM task_runs ORDER BY id DESC LIMIT 50")
        .fetch_all(&state.db)
        .await?;
    let runs: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "taskId": r.try_get::<String, _>("task_id").unwrap_or_default(),
                "ok": r.try_get::<i64, _>("ok").unwrap_or(0),
                "detail": r.try_get::<String, _>("detail").unwrap_or_default(),
                "durationMs": r.try_get::<i64, _>("duration_ms").unwrap_or_default(),
                "createdAt": r.try_get::<String, _>("created_at").unwrap_or_default(),
            })
        })
        .collect();
    let tasks: Vec<serde_json::Value> = TASKS
        .iter()
        .map(|(id, name, interval)| serde_json::json!({ "id": id, "name": name, "intervalSec": interval }))
        .collect();
    Ok((
        StatusCode::OK,
        Json(ApiResponse { code: 0, message: "ok".into(), data: Some(serde_json::json!({ "tasks": tasks, "runs": runs })) }),
    ))
}

pub async fn run_now(
    State(state): State<AppState>,
    user: AuthUser,
    Path(task_id): Path<String>,
) -> AppJson<serde_json::Value> {
    user.require("system:task:run")?;
    if !TASKS.iter().any(|(id, _, _)| *id == task_id) {
        return Err(AppError::NotFound);
    }
    let (ok, detail, dur) = run_task(&state, &task_id).await;
    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: if ok { "执行成功".into() } else { "执行失败".into() },
            data: Some(serde_json::json!({ "ok": ok, "detail": detail, "durationMs": dur })),
        }),
    ))
}

/// 后台调度：每 10 分钟检查到期任务
pub fn spawn_scheduler(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            for (id, _, interval) in TASKS.iter() {
                let last: Option<String> = sqlx::query_scalar(
                    "SELECT created_at FROM task_runs WHERE task_id = ? AND ok = 1 ORDER BY id DESC LIMIT 1",
                )
                .bind(id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();
                let due = match last {
                    None => true,
                    Some(t) => {
                        let t = chrono::DateTime::parse_from_rfc3339(&t)
                            .map(|t| t.with_timezone(&chrono::Utc))
                            .unwrap_or_else(|_| chrono::Utc::now() - chrono::Duration::weeks(9));
                        chrono::Utc::now() - t > chrono::Duration::seconds(*interval)
                    }
                };
                if due {
                    let (ok, detail, _) = run_task(&state, id).await;
                    tracing::info!(ok, "定时任务 {id}: {detail}");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(600)).await;
        }
    });
}
