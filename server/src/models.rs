use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct PageData<T: Serialize> {
    pub list: Vec<T>,
    pub total: i64,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
}

#[derive(Deserialize)]
pub struct PageQuery {
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
    pub keyword: Option<String>,
    pub status: Option<i64>,
    pub dept: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
}

impl PageQuery {
    pub fn offset_limit(&self) -> (i64, i64) {
        let page = self.page.unwrap_or(1).max(1);
        let size = self.page_size.unwrap_or(10).clamp(1, 100);
        ((page - 1) * size, size)
    }
}

#[derive(Serialize)]
pub struct UserOut {
    pub id: i64,
    pub username: String,
    pub nickname: String,
    pub email: String,
    pub phone: String,
    pub dept: String,
    pub position: String,
    pub status: i64,
    pub roles: Vec<String>,
    #[serde(rename = "lastLogin")]
    pub last_login: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateUserReq {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub nickname: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub dept: String,
    #[serde(default, rename = "position")]
    pub position: String,
    #[serde(default)]
    pub status: Option<i64>,
    #[serde(default)]
    pub roles: Vec<i64>,
}

#[derive(Deserialize)]
pub struct UpdateUserReq {
    #[serde(default)]
    pub nickname: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub dept: Option<String>,
    #[serde(default, rename = "position")]
    pub position: Option<String>,
    #[serde(default)]
    pub status: Option<i64>,
    #[serde(default)]
    pub roles: Option<Vec<i64>>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default, rename = "tenantId")]
    pub tenant_id: Option<i64>,
}

#[derive(Serialize)]
pub struct RoleOut {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub description: String,
    pub status: i64,
    pub permissions: Vec<String>,
    #[serde(rename = "userCount")]
    pub user_count: i64,
    #[serde(rename = "dataScope", default)]
    pub data_scope: String,
    #[serde(rename = "rulesJson", default)]
    pub rules_json: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct UpsertRoleReq {
    pub name: String,
    pub code: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub status: Option<i64>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default, rename = "dataScope")]
    pub data_scope: Option<String>,
    #[serde(default, rename = "rulesJson")]
    pub rules_json: Option<String>,
}

#[derive(Serialize)]
pub struct LoginOut {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "expiresIn")]
    pub expires_in: i64,
    pub user: MeOut,
}

#[derive(Serialize)]
pub struct MeOut {
    pub id: i64,
    pub username: String,
    pub nickname: String,
    pub email: String,
    pub phone: String,
    pub avatar: Option<String>,
    pub dept: String,
    pub position: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    #[serde(rename = "mustChangePassword", default)]
    pub must_change_password: bool,
}

#[derive(Deserialize)]
pub struct LoginReq {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Deserialize)]
pub struct RefreshReq {
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
}

#[derive(Serialize)]
pub struct AuditOut {
    pub id: i64,
    pub username: String,
    pub action: String,
    pub detail: String,
    pub method: String,
    pub path: String,
    #[serde(rename = "statusCode")]
    pub status_code: i64,
    pub ip: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DashboardOut {
    #[serde(rename = "userCount")]
    pub user_count: i64,
    #[serde(rename = "activeCount")]
    pub active_count: i64,
    #[serde(rename = "roleCount")]
    pub role_count: i64,
    #[serde(rename = "requestCount")]
    pub request_count: i64,
    #[serde(rename = "weeklyTrend")]
    pub weekly_trend: Vec<TrendPoint>,
    #[serde(rename = "deptDistribution")]
    pub dept_distribution: Vec<DeptCount>,
    #[serde(rename = "actionDistribution")]
    pub action_distribution: Vec<NameCount>,
    #[serde(rename = "recentActivities")]
    pub recent_activities: Vec<AuditOut>,
}

#[derive(Serialize)]
pub struct TrendPoint {
    pub date: String,
    pub value: i64,
}

#[derive(Serialize)]
pub struct DeptCount {
    pub name: String,
    pub value: i64,
}

#[derive(Serialize)]
pub struct NameCount {
    pub name: String,
    pub value: i64,
}

#[derive(Deserialize)]
pub struct UpdateProfileReq {
    pub nickname: String,
    pub email: String,
    pub phone: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordReq {
    #[serde(rename = "oldPassword")]
    pub old_password: String,
    #[serde(rename = "newPassword")]
    pub new_password: String,
}

#[derive(Serialize)]
pub struct MessageOut {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub kind: String,
    pub read: i64,
    #[serde(rename = "isBroadcast")]
    pub is_broadcast: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize)]
pub struct MessagePage {
    pub list: Vec<MessageOut>,
    pub total: i64,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
    #[serde(rename = "unreadCount")]
    pub unread_count: i64,
}

#[derive(Deserialize)]
pub struct MessageQuery {
    pub page: Option<i64>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<i64>,
    #[serde(rename = "unreadOnly")]
    pub unread_only: Option<bool>,
}

#[derive(Deserialize)]
pub struct ImportUsersReq {
    pub rows: Vec<ImportRow>,
}

#[derive(Deserialize)]
pub struct ImportRow {
    pub username: String,
    #[serde(default)]
    pub nickname: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub dept: String,
    #[serde(default, rename = "position")]
    pub position: String,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
pub struct UnreadOut {
    #[serde(rename = "unreadCount")]
    pub unread_count: i64,
}

#[derive(Serialize)]
pub struct SessionOut {
    pub id: i64,
    pub username: String,
    #[serde(rename = "isCurrent")]
    pub is_current: bool,
    #[serde(rename = "isMine")]
    pub is_mine: bool,
    pub ip: String,
    #[serde(rename = "userAgent")]
    pub user_agent: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
}

#[derive(Deserialize)]
pub struct DeptInput {
    pub name: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<i64>,
    #[serde(default)]
    pub sort: Option<i64>,
}

#[derive(Serialize)]
pub struct DeptNode {
    pub id: i64,
    pub name: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<i64>,
    pub sort: i64,
    #[serde(rename = "userCount")]
    pub user_count: i64,
    pub children: Vec<DeptNode>,
}

#[derive(Serialize)]
pub struct AvatarOut {
    pub avatar: String,
}
