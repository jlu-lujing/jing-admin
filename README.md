# Jing Console · 镜 · 企业管控台

商用企业级 Admin 框架：**React 18 + TypeScript + Tailwind CSS v4** 前端，**Rust + Axum** 后端，开箱即用的 RBAC、审计与运营能力。

![workbench](.openchamber/screenshots/page-2026-08-30T19-38-48-861.jpg)

## 特性

- **认证**：JWT 双令牌（Access 2h / Refresh 7d，refresh 轮换），401 自动刷新并重放请求；登录 5 次失败锁定 10 分钟
- **RBAC**：角色 → 权限码模型，前端菜单/路由 + 后端接口双重鉴权，权限码热补（老库自动 backfill）
- **模块**：数据看板、用户管理（搜索/筛选/分页/列排序/列设置/批量启删/CSV 导入导出）、部门树（级联改名/防环）、角色编排、审计日志（留痕/CSV 导出/定时清理）、在线会话（强制下线/设备指纹）、通知中心（广播 + WebSocket 实时推送）、⌘K 命令面板、多标签页工作台、个人设置 + 头像上传
- **体验**：深色/浅色双主题、中英双语 i18n、面包屑、移动端抽屉、多标签工作台、document.title 同步、路由懒加载分包、登录 SSO（OIDC，配置即用）
- **工程质量**：统一响应 `{code, message, data}`、优雅停机、SQLite/PostgreSQL 编译期双驱动、24 个后端集成测试、静态资源由 Axum ServeDir 托管

## 快速开始

```bash
# 后端（默认 :9800，首次启动自动建表 + seed）
cargo run -p jing-admin-server            # SQLite
cargo run -p jing-admin-server --no-default-features --features postgres   # PostgreSQL

# 前端（默认 :5273，/api 与 /uploads 代理到后端，ws 已透传）
cd web && npm install && npm run dev
```

## 演示账户

| 账户 | 密码 | 权限 |
|---|---|---|
| admin | admin123 | 超级管理员（全权限） |
| demo | demo123 | 系统管理员 |
| auditor | audit123 | 安全审计员 |
| 其余 20 个演示用户 | user123 | 访客 |

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | `sqlite://./data/jing_admin.db?mode=rwc` 或 `postgres://…` |
| `JWT_SECRET` | **生产必设**，否则启动 WARN |
| `AUDIT_RETENTION_DAYS` | 审计日志保留天数（≥7 生效，默认关闭） |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | 配置后自动启用 SSO（走 well-known discovery） |
| `OIDC_REDIRECT_URI` / `FRONTEND_URL` | SSO 回调与回跳地址 |

## API（31 端点）

完整 OpenAPI 3.1 见运行时的 `/api/docs/openapi.json`，内置 Scalar 文档页（应用内 `/docs`）可直接试用。

核心分组：`/api/auth/*`（登录/刷新/登出/SSO）、`/api/users*`（CRUD/批量导入导出/排序筛选）、`/api/departments*`（部门树）、`/api/roles*`、`/api/sessions*`（在线会话/吊销）、`/api/audit/logs*`（查询/清理）、`/api/messages*`（通知）、`/api/ws?token=`（实时推送）、`/api/uploads/avatar`（头像）。

## 工程结构

```
server/            # Axum 0.8 · 24 tests
  src/{main,db,auth,error,state,notify,models}.rs
  src/routes/{auth,users,roles,departments,dashboard,sessions,messages,audit,docs,oauth,uploads,ws}.rs
web/src/
  lib/             # api(拦截器/刷新/下载) auth theme i18n ws tabs types
  components/      # ui 组件库 · layout · TabsBar · CommandPalette · MessagesBell · charts
  pages/           # Login Dashboard Users Roles Departments Sessions AuditLogs Messages Profile Docs
```

## 安全与生产建议

- 设置强 `JWT_SECRET`；改密后会话不级联失效（可按需扩展吊销全部会话）
- SSO 新建用户默认 `viewer` 角色，需管理员升权
- SQLite 适合开发/中小规模；生产建议 PostgreSQL（`--features postgres`）
- 上传头像限制 2MB 且仅允许位图格式，静态目录 `data/uploads` 独立挂载
