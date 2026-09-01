import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RotateCcw, ScrollText, Download } from "lucide-react";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ShieldCheck } from "lucide-react";
import { toast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18n";
import type { AuditLog, PageData } from "../lib/types";
import { formatDate } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { TableShell, Td, Th, Tr } from "../components/table";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Pagination,
  SearchInput,
  Skeleton,
} from "../components/ui/primitives";

const METHOD_TONE = {
  GET: "lagoon",
  POST: "moss",
  PUT: "saffron",
  DELETE: "clay",
} as const;

export default function AuditLogs() {
  const { t } = useI18n();
  const token = useAuth((s) => s.accessToken);
  const [verifying, setVerifying] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword), 350);
    return () => clearTimeout(t);
  }, [keyword]);
  useEffect(() => setPage(1), [debounced]);

  const { data, isFetching } = useQuery({
    queryKey: ["audit", page, debounced],
    queryFn: () =>
      get<PageData<AuditLog>>("/audit/logs", { page, pageSize: 15, keyword: debounced || undefined }),
    placeholderData: (p) => p,
  });

  const rows = data?.list ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Audit"
        title={t("审计日志")}
        desc={t("记录所有关键操作与登录事件，含操作人、路径、状态码与来源 IP，供安全合规追溯。")}
      />

      <Card className="anim-rise overflow-hidden" style={{ animationDelay: "0.06s" }}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="w-full sm:w-72">
            <SearchInput
              icon={<Search className="h-4 w-4" />}
              placeholder={t("搜索操作人 / 动作 / 路径")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          {debounced && (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setKeyword("")}>
              {t("清除筛选")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => exportCsv(debounced)}
          >
            {t("导出 CSV")}
          </Button>
          <span className="ml-auto flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              icon={<ShieldCheck className="h-3.5 w-3.5 text-plum" />}
              loading={verifying}
              onClick={async () => {
                setVerifying(true);
                try {
                  const v = await fetch("/api/audit/verify", { headers: { Authorization: `Bearer ${token}` } })
                    .then((r) => r.json())
                    .then((b) => b.data);
                  if (v?.valid) toast.info(t("哈希链完整"), t("已校验 {n} 条签名日志", { n: v.checked }));
                  else toast.error(t("哈希链断裂"), t("断点位于日志 #{id}", { id: v?.brokenAt ?? "?" }));
                } finally {
                  setVerifying(false);
                }
              }}
            >
              {t("校验完整性")}
            </Button>
            <span className="text-[12.5px] text-ink-mute">
              {isFetching ? t("同步中…") : t("共 {n} 条记录", { n: data?.total ?? 0 })}
            </span>
          </span>
        </div>

        {rows.length === 0 && !isFetching ? (
          <div className="p-6">
            <EmptyState icon={<ScrollText className="h-5 w-5" />} title={t("暂无审计记录")} desc={t("系统操作发生后会自动出现在这里。")} />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>{t("时间")}</Th>
                <Th>{t("操作人")}</Th>
                <Th>{t("动作")}</Th>
                <Th>{t("请求")}</Th>
                <Th>{t("来源 IP")}</Th>
                <Th>{t("状态")}</Th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <Tr key={i}>
                      <Td colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </Td>
                    </Tr>
                  ))
                : rows.map((a) => (
                    <Tr key={a.id}>
                      <Td>
                        <span className="num text-[12px] text-ink-mute" title={a.createdAt}>
                          {formatDate(a.createdAt)}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={a.username} size={26} />
                          <span className="text-[13px] font-medium text-ink">{a.username}</span>
                        </div>
                      </Td>
                      <Td>
                        <p className="font-medium text-ink">{a.action}</p>
                        <p className="max-w-[280px] truncate text-[11.5px] text-ink-faint">{a.detail}</p>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Badge tone={METHOD_TONE[a.method as keyof typeof METHOD_TONE] ?? "neutral"}>{a.method}</Badge>
                          <code className="num rounded-md bg-canvas-deep px-1.5 py-0.5 text-[11.5px] text-ink-soft">
                            {a.path}
                          </code>
                        </div>
                      </Td>
                      <Td>
                        <span className="num text-[12px] text-ink-mute">{a.ip}</span>
                      </Td>
                      <Td>
                        <Badge tone={a.statusCode >= 400 ? "clay" : "moss"} dot>
                          {a.statusCode}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
            </tbody>
          </TableShell>
        )}

        {data && data.total > 0 && (
          <div className="border-t border-line-soft">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}

async function exportCsv(keyword: string) {
  const data = await get<PageData<AuditLog>>("/audit/logs", { page: 1, pageSize: 500, keyword: keyword || undefined });
  const header = ["id", "created_at", "username", "action", "detail", "method", "path", "status_code", "ip"];
  const rows = data.list.map((a) =>
    [a.id, a.createdAt, a.username, a.action, a.detail, a.method, a.path, a.statusCode, a.ip]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = "\ufeff" + [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
