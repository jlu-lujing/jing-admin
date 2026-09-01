import { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./components/layout";
import { get } from "./lib/api";
import { useAuth } from "./lib/auth";
import type { CurrentUser } from "./lib/types";
import { lazy, Suspense } from "react";
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Users = lazy(() => import("./pages/Users"));
const Roles = lazy(() => import("./pages/Roles"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Messages = lazy(() => import("./pages/Messages"));
const Departments = lazy(() => import("./pages/Departments"));
const Sessions = lazy(() => import("./pages/Sessions"));
const Docs = lazy(() => import("./pages/Docs"));
const Configs = lazy(() => import("./pages/Configs"));
const Dicts = lazy(() => import("./pages/Dicts"));
const Files = lazy(() => import("./pages/Files"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Keys = lazy(() => import("./pages/Keys"));
const Tenants = lazy(() => import("./pages/Tenants"));
import { MustChangeGate } from "./components/MustChangePassword";
const Profile = lazy(() => import("./pages/Profile"));
import { Forbidden, NotFound } from "./pages/errors";
import { Spinner } from "./components/ui/primitives";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePerm({ perm, children }: { perm: string; children: React.ReactNode }) {
  const perms = useAuth((s) => s.user?.permissions);
  if (perms === undefined) return <BootSplash />;
  if (!perms.includes(perm)) return <Forbidden perm={perm} />;
  return <>{children}</>;
}

/** 启动时用旧 token 拉取最新用户信息，token 失效则被拦截器清理 */
function useSessionSync() {
  const token = useAuth((s) => s.accessToken);
  const setUser = useAuth((s) => s.setUser);
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => get<CurrentUser>("/auth/me"),
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);
}

export default function App() {
  const token = useAuth((s) => s.accessToken);
  const navigate = useNavigate();
  useSessionSync();

  useEffect(() => {
    const onLogout = () => navigate("/login", { replace: true });
    window.addEventListener("jing:logout", onLogout);
    return () => window.removeEventListener("jing:logout", onLogout);
  }, [navigate]);

  return (
    <>
    <MustChangeGate />
    <Suspense fallback={<BootSplash />}>
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <RequirePerm perm="dashboard">
              <Dashboard />
            </RequirePerm>
          }
        />
        <Route
          path="users"
          element={
            <RequirePerm perm="system:user:list">
              <Users />
            </RequirePerm>
          }
        />
        <Route
          path="roles"
          element={
            <RequirePerm perm="system:role:list">
              <Roles />
            </RequirePerm>
          }
        />
        <Route
          path="audit"
          element={
            <RequirePerm perm="system:audit:list">
              <AuditLogs />
            </RequirePerm>
          }
        />
        <Route path="messages" element={<Messages />} />
        <Route path="docs" element={<Docs />} />
        <Route
          path="departments"
          element={
            <RequirePerm perm="system:dept:list">
              <Departments />
            </RequirePerm>
          }
        />
        <Route
          path="sessions"
          element={
            <RequirePerm perm="system:session:list">
              <Sessions />
            </RequirePerm>
          }
        />
        <Route
          path="configs"
          element={
            <RequirePerm perm="system:config:list">
              <Configs />
            </RequirePerm>
          }
        />
        <Route path="dicts" element={<Dicts />} />
        <Route path="files" element={<Files />} />
        <Route path="approvals" element={<Approvals />} />
        <Route
          path="tasks"
          element={
            <RequirePerm perm="system:task:list">
              <Tasks />
            </RequirePerm>
          }
        />
        <Route
          path="keys"
          element={
            <RequirePerm perm="system:key:list">
              <Keys />
            </RequirePerm>
          }
        />
        <Route
          path="tenants"
          element={
            <RequirePerm perm="system:config:list">
              <Tenants />
            </RequirePerm>
          }
        />
        <Route
          path="profile"
          element={
            <RequirePerm perm="system:settings">
              <Profile />
            </RequirePerm>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  );
}

export function BootSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}
