import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, Trash2, HardDrive } from "lucide-react";
import { del, get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Card, EmptyState, IconButton, Skeleton } from "../components/ui/primitives";
import { toast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout";
import { cn, formatDate } from "../lib/utils";

interface FileRow {
  id: number;
  name: string;
  size: number;
  mime: string;
  owner: string;
  url: string;
  createdAt: string;
}

function human(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default function Files() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const canUpload = useAuth((s) => s.has("system:file:upload"));
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: () => get<{ list: FileRow[]; totalSize: number }>("/files"),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f));
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${useAuth.getState().accessToken}` },
        body: fd,
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      return body.data as { id: number; name: string }[];
    },
    onSuccess: (d) => {
      toast(t("已上传 {n} 个文件", { n: d.length }));
      qc.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (e) => toast.error(t("上传失败"), e instanceof Error ? e.message : undefined),
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    upload.mutate(Array.from(files));
  };

  const rows = data?.list ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System · Files"
        title={t("文件中心")}
        desc={t("统一附件存储（≤10MB/个），头像与业务附件共用，链接带鉴权上下文访问。")}
        action={
          canUpload && (
            <span className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-ink-mute shadow-soft">
              <HardDrive className="h-3.5 w-3.5" />
              {t("已用")} <span className="num font-semibold text-ink">{human(data?.totalSize ?? 0)}</span>
            </span>
          )
        }
      />

      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "anim-rise flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 transition",
            dragging ? "border-ember bg-ember-soft/50" : "border-line-strong hover:border-ember/50 hover:bg-surface-2",
          )}
        >
          <UploadCloud className={cn("h-7 w-7 transition", dragging ? "scale-110 text-ember" : "text-ink-mute")} />
          <p className="text-[13.5px] font-medium text-ink">{t("拖拽或点击上传")}</p>
          <p className="text-[11.5px] text-ink-faint">{t("支持任意格式，单个不超过 10MB，可多选")}</p>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
        </div>
      )}

      <Card className="anim-rise overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<FileText className="h-5 w-5" />} title={t("还没有文件")} desc={t("上传第一个文件开始使用文件中心。")} />
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((f) => (
              <li key={f.id} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-canvas-deep text-ink-soft">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-medium text-ink hover:text-ember">
                    {f.name}
                  </a>
                  <p className="num text-[11px] text-ink-faint">
                    {human(f.size)} · {f.owner} · {formatDate(f.createdAt)}
                  </p>
                </div>
                {canUpload && (
                  <IconButton className="text-clay opacity-0 transition group-hover:opacity-100" onClick={() => remove.mutate(f.id)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
