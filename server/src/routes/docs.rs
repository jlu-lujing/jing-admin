use axum::http::StatusCode;
use axum::Json;

use crate::error::AppJson;
use crate::error::ApiResponse;

pub async fn openapi() -> AppJson<serde_json::Value> {
    let spec = serde_json::json!({
        "openapi": "3.1.0",
        "info": {
            "title": "Jing Console API",
            "version": "0.3.0",
            "description": "镜 · 企业管控台后端 API（Axum）。除 /api/auth/login、/refresh 外所有接口需 Bearer access token。响应统一为 { code, message, data }。"
        },
        "components": {
            "securitySchemes": { "bearer": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" } }
        },
        "security": [{ "bearer": [] }],
        "paths": {
            "/api/health": { "get": { "summary": "健康检查", "security": [], "tags": ["system"] } },
            "/api/auth/login": { "post": { "summary": "登录（返回双令牌 + 用户信息，5 次失败锁定 10 分钟）", "security": [], "tags": ["auth"] } },
            "/api/auth/refresh": { "post": { "summary": "刷新令牌（旧 refresh 轮换作废）", "security": [], "tags": ["auth"] } },
            "/api/auth/logout": { "post": { "summary": "登出（吊销当前会话）", "tags": ["auth"] } },
            "/api/auth/me": { "get": { "summary": "当前用户与权限", "tags": ["auth"] } },
            "/api/auth/oauth/status": { "get": { "summary": "SSO 可用状态", "security": [], "tags": ["auth"] } },
            "/api/auth/oauth/login": { "get": { "summary": "跳转 OIDC 授权", "security": [], "tags": ["auth"] } },
            "/api/auth/oauth/callback": { "get": { "summary": "OIDC 回调（自动建户并回跳前端）", "security": [], "tags": ["auth"] } },
            "/api/profile": { "put": { "summary": "更新个人资料", "tags": ["auth"] } },
            "/api/profile/password": { "put": { "summary": "修改密码", "tags": ["auth"] } },
            "/api/uploads/avatar": { "post": { "summary": "上传头像（multipart file，≤2MB）", "tags": ["profile"] } },
            "/api/users": {
                "get": { "summary": "用户分页（keyword/dept/status/sort）", "tags": ["users"], "parameters": [
                    { "name": "page", "in": "query", "schema": { "type": "integer" } },
                    { "name": "pageSize", "in": "query", "schema": { "type": "integer" } },
                    { "name": "keyword", "in": "query", "schema": { "type": "string" } },
                    { "name": "sort", "in": "query", "schema": { "type": "string", "enum": ["username","nickname","dept","status","createdAt"] } },
                    { "name": "order", "in": "query", "schema": { "type": "string", "enum": ["asc","desc"] } }
                ] },
                "post": { "summary": "创建用户（system:user:create）", "tags": ["users"] }
            },
            "/api/users/{id}": {
                "put": { "summary": "更新用户/重置密码/角色（system:user:update）", "tags": ["users"] },
                "delete": { "summary": "删除用户（system:user:delete）", "tags": ["users"] }
            },
            "/api/users/export": { "get": { "summary": "导出全部用户 CSV（带 BOM）", "tags": ["users"] } },
            "/api/users/import": { "post": { "summary": "CSV 行批量导入（system:user:create）", "tags": ["users"] } },
            "/api/roles": {
                "get": { "summary": "角色列表（system:role:list）", "tags": ["roles"] },
                "post": { "summary": "创建角色（system:role:create）", "tags": ["roles"] }
            },
            "/api/roles/permissions": { "get": { "summary": "权限码目录", "tags": ["roles"] } },
            "/api/roles/{id}": {
                "put": { "summary": "更新角色（system:role:update）", "tags": ["roles"] },
                "delete": { "summary": "删除角色（system:role:delete）", "tags": ["roles"] }
            },
            "/api/departments": {
                "get": { "summary": "部门树（system:dept:list）", "tags": ["departments"] },
                "post": { "summary": "新建部门（system:dept:create）", "tags": ["departments"] }
            },
            "/api/departments/{id}": {
                "put": { "summary": "重命名/移动/排序，改名级联用户（system:dept:update）", "tags": ["departments"] },
                "delete": { "summary": "删除部门（system:dept:delete）", "tags": ["departments"] }
            },
            "/api/sessions": { "get": { "summary": "我的在线会话", "tags": ["sessions"] } },
            "/api/sessions/all": { "get": { "summary": "全部在线会话（system:session:list）", "tags": ["sessions"] } },
            "/api/sessions/{id}": { "delete": { "summary": "吊销会话；他人会话需 system:session:revoke", "tags": ["sessions"] } },
            "/api/sessions/revoke-others": { "put": { "summary": "踢掉我的其他设备", "tags": ["sessions"] } },
            "/api/dashboard/overview": { "get": { "summary": "看板聚合（dashboard）", "tags": ["dashboard"] } },
            "/api/audit/logs": {
                "get": { "summary": "审计日志分页（system:audit:list）", "tags": ["audit"] },
                "delete": { "summary": "清理历史日志 ?beforeDays=N（system:audit:list）", "tags": ["audit"] }
            },
            "/api/messages": { "get": { "summary": "通知分页（unreadOnly 可选，含未读数）", "tags": ["messages"] } },
            "/api/messages/unread": { "get": { "summary": "未读数", "tags": ["messages"] } },
            "/api/messages/{id}/read": { "put": { "summary": "标记已读", "tags": ["messages"] } },
            "/api/messages/read-all": { "put": { "summary": "全部已读", "tags": ["messages"] } },
            "/api/ws": { "get": { "summary": "WebSocket 实时通知 ?token=（广播 + 定向消息，在线人数）", "security": [], "tags": ["realtime"] } }
        }
    });
    Ok((StatusCode::OK, Json(ApiResponse { code: 0, message: "ok".into(), data: Some(spec) })))
}
