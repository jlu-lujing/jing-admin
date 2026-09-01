use sqlx::Row;

use crate::{auth, error::AppError, notify};

#[cfg(not(feature = "postgres"))]
pub type Db = sqlx::SqlitePool;
#[cfg(feature = "postgres")]
pub type Db = sqlx::PgPool;

pub fn is_postgres() -> bool {
    cfg!(feature = "postgres")
}

pub async fn init_pool(url: &str) -> Result<Db, AppError> {
    let pool = connect(url).await?;
    migrate(&pool).await?;
    seed(&pool).await?;
    backfill_permissions(&pool).await?;
    backfill_departments(&pool).await?;
    backfill_messages(&pool).await?;
    backfill_defaults(&pool).await?;
    Ok(pool)
}

/// 单一 schema 源；PG 仅做自增主键的方言替换
async fn migrate(pool: &Db) -> Result<(), AppError> {
    let pg = is_postgres();
    let mut statements = String::from(
        r#"
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        nickname      TEXT NOT NULL DEFAULT '',
        email         TEXT NOT NULL DEFAULT '',
        phone         TEXT NOT NULL DEFAULT '',
        avatar        TEXT,
        dept          TEXT NOT NULL DEFAULT '',
        position      TEXT NOT NULL DEFAULT '',
        status        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        last_login    TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        code        TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        status      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        code        TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
        role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER,
        username    TEXT NOT NULL DEFAULT '',
        action      TEXT NOT NULL DEFAULT '',
        detail      TEXT NOT NULL DEFAULT '',
        method      TEXT NOT NULL DEFAULT '',
        path        TEXT NOT NULL DEFAULT '',
        status_code INTEGER NOT NULL DEFAULT 0,
        ip          TEXT NOT NULL DEFAULT '',
        user_agent  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        kind       TEXT NOT NULL DEFAULT 'info',
        read       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jti         TEXT NOT NULL UNIQUE,
        refresh_jti TEXT NOT NULL DEFAULT '',
        username    TEXT NOT NULL DEFAULT '',
        ip          TEXT NOT NULL DEFAULT '',
        user_agent  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        revoked     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS departments (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT NOT NULL UNIQUE,
        parent_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
        sort      INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS configs (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL DEFAULT '',
        label      TEXT NOT NULL DEFAULT '',
        is_public  INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dict_types (
        code       TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dict_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type_code  TEXT NOT NULL REFERENCES dict_types(code) ON DELETE CASCADE,
        value      TEXT NOT NULL,
        label      TEXT NOT NULL,
        sort       INTEGER NOT NULL DEFAULT 0,
        enabled    INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS files (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL,
        size       INTEGER NOT NULL DEFAULT 0,
        mime       TEXT NOT NULL DEFAULT '',
        owner      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_requests (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        reason     TEXT NOT NULL DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'pending',
        handled_by INTEGER,
        created_at TEXT NOT NULL,
        handled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id     TEXT NOT NULL,
        ok          INTEGER NOT NULL DEFAULT 1,
        detail      TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        key_hash   TEXT NOT NULL UNIQUE,
        prefix     TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_used  TEXT
    );

    CREATE TABLE IF NOT EXISTS tenants (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        plan       TEXT NOT NULL DEFAULT 'free',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pwd_history (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hash       TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL
    );
    "#,
    );

    if pg {
        statements = statements.replace(
            "INTEGER PRIMARY KEY AUTOINCREMENT",
            "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
        );
        statements = statements.replace("INTEGER", "BIGINT");
    }

    sqlx::raw_sql(&statements)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("迁移失败: {e}")))?;

    let alts: [&str; 10] = [
        "ALTER TABLE users ADD COLUMN deleted_at TEXT",
        "ALTER TABLE users ADD COLUMN totp_secret TEXT",
        "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
        "ALTER TABLE roles ADD COLUMN data_scope TEXT NOT NULL DEFAULT 'all'",
        "ALTER TABLE users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD COLUMN pwd_changed_at TEXT",
        "ALTER TABLE roles ADD COLUMN rules_json TEXT",
        "ALTER TABLE audit_logs ADD COLUMN hash TEXT",
        "ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT",
    ];
    for sql in alts {
        let _ = sqlx::raw_sql(sql).execute(pool).await;
    }

    sqlx::raw_sql(&format!(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES ('v4', '004_security_tenancy', '{}') ON CONFLICT (version) DO NOTHING",
        chrono::Utc::now().to_rfc3339()
    ))
    .execute(pool)
    .await
    .ok();

    Ok(())
}

async fn seed(pool: &Db) -> Result<(), AppError> {
    let count: i64 = sqlx::query("SELECT COUNT(*) as c FROM roles")
        .fetch_one(pool)
        .await?
        .try_get("c")?;
    if count > 0 {
        return Ok(());
    }

    let now = auth::now_iso();

    for (code, name, desc) in auth::ALL_PERMISSIONS.iter() {
        sqlx::query("INSERT INTO permissions (code, name, description) VALUES (?, ?, ?)")
            .bind(code)
            .bind(name)
            .bind(desc)
            .execute(pool)
            .await?;
    }

    let all_perm_ids: Vec<i64> = sqlx::query("SELECT id FROM permissions")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|r| r.try_get("id").unwrap())
        .collect();

    async fn new_role(pool: &Db, name: &str, code: &str, desc: &str, now: &str) -> Result<i64, AppError> {
        Ok(
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO roles (name, code, description, status, created_at) VALUES (?, ?, ?, 1, ?) RETURNING id",
            )
            .bind(name)
            .bind(code)
            .bind(desc)
            .bind(now)
            .fetch_one(pool)
            .await?,
        )
    }

    let super_id = new_role(pool, "超级管理员", "super_admin", "拥有系统全部权限", &now).await?;
    let admin_id = new_role(pool, "系统管理员", "admin", "用户与角色管理", &now).await?;
    let viewer_id = new_role(pool, "访客", "viewer", "仅查看仪表盘", &now).await?;
    let auditor_id = new_role(pool, "安全审计员", "auditor", "查看操作审计日志", &now).await?;

    async fn grant(pool: &Db, role: i64, codes: &[&str]) -> Result<(), AppError> {
        for c in codes {
            grant_one(pool, role, c).await?;
        }
        Ok(())
    }

    async fn grant_one(pool: &Db, role: i64, code: &str) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO role_permissions (role_id, permission_id)
             SELECT ?, id FROM permissions WHERE code = ?
             ON CONFLICT DO NOTHING",
        )
        .bind(role)
        .bind(code)
        .execute(pool)
        .await?;
        Ok(())
    }

    for pid in &all_perm_ids {
        sqlx::query("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .bind(super_id)
            .bind(pid)
            .execute(pool)
            .await?;
    }
    grant(pool, admin_id, &["dashboard","system:user:list","system:user:create","system:user:update","system:role:list","system:settings","system:dept:list","system:session:list"]).await?;
    grant(pool, viewer_id, &["dashboard"]).await?;
    grant(pool, auditor_id, &["dashboard","system:audit:list"]).await?;
    let _ = auditor_id;

    async fn new_user(
        pool: &Db,
        username: &str,
        hash: &str,
        nickname: &str,
        email: &str,
        phone: &str,
        dept: &str,
        position: &str,
        last_login: Option<&str>,
        now: &str,
    ) -> Result<i64, AppError> {
        Ok(
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO users (username, password_hash, nickname, email, phone, dept, position, status, created_at, updated_at, last_login)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?) RETURNING id",
            )
            .bind(username)
            .bind(hash)
            .bind(nickname)
            .bind(email)
            .bind(phone)
            .bind(dept)
            .bind(position)
            .bind(now)
            .bind(now)
            .bind(last_login)
            .fetch_one(pool)
            .await?,
        )
    }

    let admin_hash = auth::hash_password("admin123")?;
    let uid = new_user(pool, "admin", &admin_hash, "系统超管", "admin@jing.dev", "13800000000", "技术中台", "平台负责人", Some(&now), &now).await?;
    link_role(pool, uid, super_id).await?;

    let demo_hash = auth::hash_password("demo123")?;
    let uid = new_user(pool, "demo", &demo_hash, "张演示", "demo@jing.dev", "13900000001", "产品设计部", "高级产品经理", Some(&auth::days_ago_iso(1)), &now).await?;
    link_role(pool, uid, admin_id).await?;

    let auditor_hash = auth::hash_password("audit123")?;
    let uid = new_user(pool, "auditor", &auditor_hash, "李安全", "auditor@jing.dev", "13700000002", "安全合规部", "安全审计专家", Some(&auth::days_ago_iso(3)), &now).await?;
    link_role(pool, uid, auditor_id).await?;

    seed_fake_users(pool).await?;
    seed_audit_logs(pool).await?;
    sqlx::query("INSERT INTO tenants (name, plan, created_at) VALUES ('默认租户', 'enterprise', ?) ON CONFLICT DO NOTHING")
        .bind(auth::now_iso())
        .execute(pool)
        .await?;

    tracing::info!("seed 数据初始化完成");
    Ok(())
}

pub async fn link_role(pool: &Db, user_id: i64, role_id: i64) -> Result<(), AppError> {
    sqlx::query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
        .bind(user_id)
        .bind(role_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub(crate) async fn role_id(pool: &Db, code: &str) -> Result<i64, AppError> {
    Ok(sqlx::query_scalar::<_, i64>("SELECT id FROM roles WHERE code = ?")
        .bind(code)
        .fetch_one(pool)
        .await?)
}

/// 已存在的库补种新增权限码，并授予超管全部、管理员部分
async fn backfill_permissions(pool: &Db) -> Result<(), AppError> {
    let super_id = sqlx::query("SELECT COUNT(*) as c FROM roles")
        .fetch_one(pool)
        .await?
        .try_get::<i64, _>("c")?;
    if super_id == 0 {
        return Ok(());
    }
    let super_id = role_id(pool, "super_admin").await?;
    let admin_id = role_id(pool, "admin").await.unwrap_or(super_id);

    let new_perms = crate::auth::EXTRA_PERMISSIONS;
    for (code, name, desc) in new_perms.iter() {
        let id: Option<i64> = sqlx::query_scalar("SELECT id FROM permissions WHERE code = ?")
            .bind(code)
            .fetch_optional(pool)
            .await?;
        if id.is_none() {
            sqlx::query("INSERT INTO permissions (code, name, description) VALUES (?, ?, ?)")
                .bind(code)
                .bind(name)
                .bind(desc)
                .execute(pool)
                .await?;
        }
        let pid: i64 = sqlx::query_scalar("SELECT id FROM permissions WHERE code = ?")
            .bind(code)
            .fetch_one(pool)
            .await?;
        sqlx::query("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .bind(super_id)
            .bind(pid)
            .execute(pool)
            .await?;
        if ["system:dept:list", "system:session:list"].contains(code) {
            sqlx::query("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                .bind(admin_id)
                .bind(pid)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

/// 部门表为空时，用现有用户部门名回填根部门
async fn backfill_departments(pool: &Db) -> Result<(), AppError> {
    let count: i64 = sqlx::query("SELECT COUNT(*) as c FROM departments")
        .fetch_one(pool)
        .await?
        .try_get("c")?;
    if count > 0 {
        return Ok(());
    }
    let rows = sqlx::query("SELECT DISTINCT dept FROM users WHERE dept != '' ORDER BY dept")
        .fetch_all(pool)
        .await?;
    for (i, r) in rows.iter().enumerate() {
        let name: String = r.try_get("dept")?;
        sqlx::query("INSERT INTO departments (name, parent_id, sort, created_at) VALUES (?, NULL, ?, ?)")
            .bind(name)
            .bind(i as i64)
            .bind(auth::now_iso())
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// 消息为空时回填几条演示通知（广播消息 user_id = NULL）
async fn backfill_messages(pool: &Db) -> Result<(), AppError> {
    let count: i64 = sqlx::query("SELECT COUNT(*) as c FROM messages")
        .fetch_one(pool)
        .await?
        .try_get("c")?;
    if count > 0 {
        return Ok(());
    }
    let samples = [
        ("系统升级公告", "v0.3 上线：部门管理、会话管理、实时通知、多标签页工作台已就绪", "update"),
        ("安全提醒", "检测到 admin 在非常用时段登录，如非本人操作请及时改密", "warning"),
        ("运营周报", "本周新增 3 名成员，审计事件持续增长，建议开启日志保留任务", "info"),
    ];
    for (title, content, kind) in samples {
        broadcast(pool, title, content, kind).await;
    }
    Ok(())
}

/// 写入并广播一条系统通知（静默失败）
pub async fn broadcast(pool: &Db, title: &str, content: &str, kind: &str) {
    let created = auth::now_iso();
    let inserted: Result<i64, _> = sqlx::query_scalar::<_, i64>(
        "INSERT INTO messages (user_id, title, content, kind, read, created_at) VALUES (NULL, ?, ?, ?, 0, ?) RETURNING id",
    )
    .bind(title)
    .bind(content)
    .bind(kind)
    .bind(&created)
    .fetch_one(pool)
    .await;

    match inserted {
        Ok(id) => notify::push(serde_json::json!({
            "type": "message",
            "id": id,
            "title": title,
            "content": content,
            "kind": kind,
            "userId": serde_json::Value::Null,
        })),
        Err(e) => tracing::warn!("通知广播失败: {e}"),
    }
}

/// 写入一条个人通知并定向推送
pub async fn notify_user(pool: &Db, user_id: i64, title: &str, content: &str, kind: &str) {
    let inserted: Result<i64, _> = sqlx::query_scalar::<_, i64>(
        "INSERT INTO messages (user_id, title, content, kind, read, created_at) VALUES (?, ?, ?, ?, 0, ?) RETURNING id",
    )
    .bind(user_id)
    .bind(title)
    .bind(content)
    .bind(kind)
    .bind(auth::now_iso())
    .fetch_one(pool)
    .await;

    if let Ok(id) = inserted {
        notify::push(serde_json::json!({
            "type": "message",
            "id": id,
            "title": title,
            "content": content,
            "kind": kind,
            "userId": user_id,
        }));
    }
}

async fn seed_fake_users(pool: &Db) -> Result<(), AppError> {
    let hash = auth::hash_password("user123")?;
    let rows: Vec<(&str, &str, &str, &str, &str, i64, i64)> = vec![
        ("chenxi", "陈曦", "产品设计部", "交互设计师", "13611110001", 1, 12),
        ("wanglin", "王林", "技术中台", "后端工程师", "13611110002", 1, 45),
        ("zhaoyu", "赵宇", "技术中台", "前端工程师", "13611110003", 1, 30),
        ("sunqi", "孙琪", "增长运营部", "运营专员", "13611110004", 1, 8),
        ("zhouming", "周明", "技术中台", "测试工程师", "13611110005", 0, 60),
        ("wuhao", "吴昊", "数据智能部", "数据分析师", "13611110006", 1, 22),
        ("zhengshuang", "郑爽", "增长运营部", "内容运营", "13611110007", 1, 15),
        ("fenglei", "冯磊", "安全合规部", "渗透测试工程师", "13611110008", 1, 90),
        ("hujie", "胡杰", "数据智能部", "算法工程师", "13611110009", 1, 40),
        ("meiting", "梅婷", "产品设计部", "视觉设计师", "13611110010", 1, 5),
        ("luoan", "罗安", "技术中台", "SRE 工程师", "13611110011", 1, 70),
        ("xieyun", "谢云", "增长运营部", "市场经理", "13611110012", 0, 120),
        ("tangyao", "唐遥", "数据智能部", "BI 工程师", "13611110013", 1, 18),
        ("dengli", "邓丽", "产品设计部", "用户研究员", "13611110014", 1, 28),
        ("caoyang", "曹阳", "技术中台", "客户端工程师", "13611110015", 1, 33),
        ("xuqing", "许晴", "安全合规部", "风控策略分析师", "13611110016", 1, 55),
        ("hanmei", "韩梅", "增长运营部", "渠道运营", "13611110017", 1, 9),
        ("yangfan", "杨帆", "数据智能部", "数据工程师", "13611110018", 0, 99),
        ("zhuang", "庄严", "技术中台", "架构师", "13611110019", 1, 200),
        ("nihong", "倪虹", "产品设计部", "产品助理", "13611110020", 1, 3),
    ];
    let viewer = role_id(pool, "viewer").await?;

    for (username, nickname, dept, position, phone, status, days_ago) in rows {
        let created = auth::days_ago_iso(days_ago.max(1));
        let last_login = if days_ago < 30 {
            auth::rand_time_within_days(days_ago.max(1)).to_rfc3339()
        } else {
            created.clone()
        };
        let uid: i64 = sqlx::query_scalar::<_, i64>(
            "INSERT INTO users (username, password_hash, nickname, email, phone, dept, position, status, created_at, updated_at, last_login)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(username)
        .bind(&hash)
        .bind(nickname)
        .bind(format!("{username}@jing.dev"))
        .bind(phone)
        .bind(dept)
        .bind(position)
        .bind(status)
        .bind(&created)
        .bind(&created)
        .bind(&last_login)
        .fetch_one(pool)
        .await?;
        link_role(pool, uid, viewer).await?;
    }
    Ok(())
}

async fn seed_audit_logs(pool: &Db) -> Result<(), AppError> {
    let samples: Vec<(&str, &str, &str, &str, i64)> = vec![
        ("admin", "登录", "管理员登录系统", "POST /api/auth/login", 0),
        ("demo", "编辑用户", "更新用户 王林 的部门信息", "PUT /api/users/3", 0),
        ("admin", "新增角色", "创建角色「安全审计员」", "POST /api/roles", 0),
        ("auditor", "查看审计", "查询近 7 天操作日志", "GET /api/audit-logs", 0),
        ("admin", "禁用用户", "禁用用户 zhouming", "PUT /api/users/6/status", 0),
        ("demo", "编辑角色", "调整角色「访客」权限", "PUT /api/roles/3", 0),
        ("chenxi", "登录", "用户登录", "POST /api/auth/login", 0),
        ("admin", "删除角色", "删除角色「临时测试组」", "DELETE /api/roles/7", 0),
        ("wanglin", "登录", "用户登录", "POST /api/auth/login", 0),
        ("admin", "新增用户", "创建用户 nihong", "POST /api/users", 0),
        ("demo", "登录", "用户登录", "POST /api/auth/login", 0),
        ("auditor", "查看审计", "导出审计日志", "GET /api/audit-logs", 0),
        ("admin", "编辑用户", "更新用户 hujie 的职位", "PUT /api/users/9", 0),
        ("zhaoyu", "登录", "用户登录", "POST /api/auth/login", 0),
        ("admin", "重置密码", "重置用户 nihong 密码", "PUT /api/users/21/password", 0),
    ];
    let mut i = 0i64;
    for (username, action, detail, path, _) in samples {
        for _ in 0..3 {
            let created = auth::rand_time_within_days(14).to_rfc3339();
            let method = path.split(' ').next().unwrap_or("GET");
            let path_only = path.split(' ').nth(1).unwrap_or("/");
            sqlx::query(
                "INSERT INTO audit_logs (user_id, username, action, detail, method, path, status_code, ip, user_agent, created_at)
                 VALUES (NULL, ?, ?, ?, ?, ?, 200, ?, ?, ?)",
            )
            .bind(username)
            .bind(action)
            .bind(detail)
            .bind(method)
            .bind(path_only)
            .bind(format!("10.8.{}.{}", i % 250, (i * 7) % 250))
            .bind("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
            .bind(&created)
            .execute(pool)
            .await?;
            i += 1;
        }
    }
    Ok(())
}

#[cfg(not(feature = "postgres"))]
async fn connect(url: &str) -> Result<Db, AppError> {
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
    use std::str::FromStr;
    let max_conn = if url.contains(":memory:") { 1 } else { 10 };
    let opts = SqliteConnectOptions::from_str(url)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));
    SqlitePoolOptions::new()
        .max_connections(max_conn)
        .connect_with(opts)
        .await
        .map_err(|e| AppError::Internal(format!("数据库连接失败: {e}")))
}

#[cfg(feature = "postgres")]
async fn connect(url: &str) -> Result<Db, AppError> {
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
    use std::str::FromStr;
    let opts = PgConnectOptions::from_str(url)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    PgPoolOptions::new()
        .max_connections(10)
        .connect_with(opts)
        .await
        .map_err(|e| AppError::Internal(format!("Postgres 连接失败: {e}")))
}

/// 配置中心与数据字典的出厂默认值
async fn backfill_defaults(pool: &Db) -> Result<(), AppError> {
    let cfgs: [(&str, &str, &str, i64); 8] = [
        ("site_name", "JingAdmin · 企业管控台", "站点名称", 1),
        ("audit_retention_days", "180", "审计日志保留天数（<7 关闭自动清理）", 0),
        ("announcement", "", "全站公告横幅（留空不展示）", 1),
        ("rate_limit_per_min", "100000", "接口限流（次/分钟/用户，0 关闭）", 0),
        ("pwd_min_length", "6", "密码最小长度", 0),
        ("pwd_history_count", "3", "禁止复用最近 N 个密码（0 关闭）", 0),
        ("pwd_expiry_days", "0", "密码有效天数（0 永不过期）", 0),
        ("backup_keep", "5", "数据库备份保留份数", 0),
    ];
    for (k, v, label, public) in cfgs {
        sqlx::query(
            "INSERT INTO configs (key, value, label, is_public, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
        )
        .bind(k)
        .bind(v)
        .bind(label)
        .bind(public)
        .bind(auth::now_iso())
        .execute(pool)
        .await?;
    }

    let types: [(&str, &str); 2] = [("position_level", "职级"), ("employment_type", "用工类型")];
    for (code, name) in types {
        sqlx::query("INSERT INTO dict_types (code, name, created_at) VALUES (?, ?, ?) ON CONFLICT (code) DO NOTHING")
            .bind(code)
            .bind(name)
            .bind(auth::now_iso())
            .execute(pool)
            .await?;
    }
    let items: [(&str, &str, &str, i64); 8] = [
        ("position_level", "P4", "初级", 1),
        ("position_level", "P5", "中级", 2),
        ("position_level", "P6", "高级", 3),
        ("position_level", "P7", "专家", 4),
        ("employment_type", "full", "正式员工", 1),
        ("employment_type", "probation", "试用期", 2),
        ("employment_type", "outsource", "外包", 3),
        ("employment_type", "intern", "实习", 4),
    ];
    for (tc, value, label, sort) in items {
        let exists: i64 = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM dict_items WHERE type_code = ? AND value = ?")
            .bind(tc)
            .bind(value)
            .fetch_one(pool)
            .await?;
        if exists == 0 {
            sqlx::query("INSERT INTO dict_items (type_code, value, label, sort) VALUES (?, ?, ?, ?)")
                .bind(tc)
                .bind(value)
                .bind(label)
                .bind(sort)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}
