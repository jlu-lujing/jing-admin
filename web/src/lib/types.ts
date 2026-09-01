export interface User {
  id: number;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  dept: string;
  position: string;
  status: number;
  roles: string[];
  lastLogin: string | null;
  createdAt: string;
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  status: number;
  permissions: string[];
  userCount: number;
  dataScope?: string;
  rulesJson?: string | null;
  createdAt: string;
}

export interface Permission {
  code: string;
  name: string;
  description: string;
}

export interface AuditLog {
  id: number;
  username: string;
  action: string;
  detail: string;
  method: string;
  path: string;
  statusCode: number;
  ip: string;
  createdAt: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string | null;
  dept: string;
  position: string;
  roles: string[];
  permissions: string[];
  mustChangePassword?: boolean;
}

export interface PageData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardData {
  userCount: number;
  activeCount: number;
  roleCount: number;
  requestCount: number;
  weeklyTrend: { date: string; value: number }[];
  deptDistribution: { name: string; value: number }[];
  actionDistribution: { name: string; value: number }[];
  recentActivities: AuditLog[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUser;
}

export interface Message {
  id: number;
  title: string;
  content: string;
  kind: string;
  read: number;
  isBroadcast: boolean;
  createdAt: string;
}

export interface MessagePageData {
  list: Message[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface SessionInfo {
  id: number;
  username: string;
  isCurrent: boolean;
  isMine: boolean;
  ip: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
}

export interface DeptNode {
  id: number;
  name: string;
  parentId: number | null;
  sort: number;
  userCount: number;
  children: DeptNode[];
}

export interface WsMessage {
  type: string;
  id?: number;
  title?: string;
  content?: string;
  kind?: string;
  userId?: number | null;
  online?: number;
}

export interface OauthStatus {
  enabled: boolean;
  provider: string;
}
