use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::Datelike;
use sqlx::Row;

use crate::auth::AuthUser;
use crate::error::{AppJson, ApiResponse};
use crate::models::{AuditOut, DashboardOut, DeptCount, NameCount, TrendPoint};
use crate::state::AppState;

#[derive(serde::Deserialize)]
pub struct DashboardQuery {
    pub days: Option<i64>,
}

pub async fn overview(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<DashboardQuery>,
) -> AppJson<DashboardOut> {
    user.require("dashboard")?;
    let days = q.days.unwrap_or(7).clamp(7, 30);

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND tenant_id = ?1")
        .bind(user.tenant_id)
        .fetch_one(&state.db)
        .await?;
    let active_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE status = 1 AND deleted_at IS NULL AND tenant_id = ?1")
        .bind(user.tenant_id)
        .fetch_one(&state.db)
        .await?;
    let role_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM roles")
        .fetch_one(&state.db)
        .await?;
    let request_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs")
        .fetch_one(&state.db)
        .await?;

    let mut weekly_trend = Vec::new();
    for d in (0..days).rev() {
        let day = (chrono::Utc::now() - chrono::Duration::days(d)).date_naive();
        let start = day.and_hms_opt(0,0,0).unwrap().and_utc();
        let end = start + chrono::Duration::days(1);
        let v: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM audit_logs WHERE created_at >= ? AND created_at < ?",
        )
        .bind(start.to_rfc3339())
        .bind(end.to_rfc3339())
        .fetch_one(&state.db)
        .await?;
        weekly_trend.push(TrendPoint {
            date: format!("{:02}-{:02}", day.month(), day.day()),
            value: v,
        });
    }

    let dept_distribution: Vec<DeptCount> = sqlx::query(
        "SELECT dept AS name, COUNT(*) AS value FROM users WHERE dept != '' GROUP BY dept ORDER BY value DESC",
    )
    .fetch_all(&state.db)
    .await?
    .iter()
    .map(|r| DeptCount {
        name: r.try_get("name").unwrap_or_default(),
        value: r.try_get("value").unwrap_or_default(),
    })
    .collect();

    let action_distribution: Vec<NameCount> = sqlx::query(
        "SELECT action AS name, COUNT(*) AS value FROM audit_logs GROUP BY action ORDER BY value DESC LIMIT 6",
    )
    .fetch_all(&state.db)
    .await?
    .iter()
    .map(|r| NameCount {
        name: r.try_get("name").unwrap_or_default(),
        value: r.try_get("value").unwrap_or_default(),
    })
    .collect();

    let recent_activities: Vec<AuditOut> = sqlx::query("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8")
        .fetch_all(&state.db)
        .await?
        .iter()
        .map(|r| AuditOut {
            id: r.try_get("id").unwrap_or_default(),
            username: r.try_get("username").unwrap_or_default(),
            action: r.try_get("action").unwrap_or_default(),
            detail: r.try_get("detail").unwrap_or_default(),
            method: r.try_get("method").unwrap_or_default(),
            path: r.try_get("path").unwrap_or_default(),
            status_code: r.try_get("status_code").unwrap_or_default(),
            ip: r.try_get("ip").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok((
        StatusCode::OK,
        Json(ApiResponse {
            code: 0,
            message: "ok".into(),
            data: Some(DashboardOut {
                user_count,
                active_count,
                role_count,
                request_count,
                weekly_trend,
                dept_distribution,
                action_distribution,
                recent_activities,
            }),
        }),
    ))
}
