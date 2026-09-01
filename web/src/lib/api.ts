import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { useAuth } from "./auth";

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

const http = axios.create({
  baseURL: "/api",
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setSession, clear } = useAuth.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<Envelope<{
      accessToken: string;
      refreshToken: string;
      user: import("./types").CurrentUser;
    }>>("/api/auth/refresh", { refreshToken });
    if (data.code === 0 && data.data) {
      setSession(data.data);
      return data.data.accessToken;
    }
    clear();
    return null;
  } catch {
    clear();
    return null;
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<Envelope<unknown>>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const code = (error.response?.data as Envelope<unknown> | undefined)?.code;

    if ((status === 401 || code === 4011) && original && !original._retried && !original.url?.includes("/auth/refresh")) {
      original._retried = true;
      refreshing = refreshing ?? doRefresh().finally(() => (refreshing = null));
      const newToken = await refreshing;
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return http(original);
      }
      useAuth.getState().clear();
      window.dispatchEvent(new Event("jing:logout"));
    }
    return Promise.reject(error);
  },
);

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await http.request<Envelope<T>>(config);
    const body = res.data;
    if (body.code !== 0) throw new ApiError(body.message, body.code, res.status);
    return body.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const msg =
        (e.response?.data as Envelope<unknown> | undefined)?.message ||
        e.message ||
        "网络异常，请稍后重试";
      const status = e.response?.status ?? 0;
      const code = (e.response?.data as Envelope<unknown> | undefined)?.code ?? -1;
      throw new ApiError(msg, code, status);
    }
    throw e;
  }
}

export const get = <T>(url: string, params?: Record<string, unknown>) =>
  api<T>({ method: "GET", url, params });
export const post = <T>(url: string, body?: unknown) => api<T>({ method: "POST", url, data: body });
export const put = <T>(url: string, body?: unknown) => api<T>({ method: "PUT", url, data: body });
export const del = <T>(url: string) => api<T>({ method: "DELETE", url });

export async function download(url: string, filename: string) {
  try {
    const res = await http.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
      const text = await e.response.data.text();
      try {
        const parsed = JSON.parse(text) as Envelope<unknown>;
        throw new ApiError(parsed.message, parsed.code, e.response.status);
      } catch (err) {
        if (err instanceof ApiError) throw err;
      }
    }
    throw new ApiError("下载失败", -1, 0);
  }
}
