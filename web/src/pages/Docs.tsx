import { useEffect, useRef, useState } from "react";
import { get } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { PageHeader } from "../components/layout";
import { Badge, Card, Button } from "../components/ui/primitives";
import { download } from "../lib/api";
import { Download } from "lucide-react";

export default function Docs() {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [methodCount, setMethodCount] = useState(0);

  useEffect(() => {
    get<{ paths: Record<string, unknown> }>("/docs/openapi.json")
      .then((spec) => setMethodCount(Object.keys(spec.paths ?? {}).length))
      .catch(() => setFailed(true));

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
    script.dataset.url = "/api/docs/openapi.json";
    script.onerror = () => setFailed(true);
    const mount = hostRef.current;
    mount?.appendChild(script);
    return () => {
      if (mount) mount.innerHTML = "";
    };
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Developer"
        title={t("API 文档")}
        desc={t("OpenAPI 3.1 规范，由 Axum 路由实时同步。可直接在页面试用接口。")}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="ember" dot>{t("{n} 个端点", { n: methodCount })}</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => download("/docs/openapi.json", "openapi.json")}
            >
              openapi.json
            </Button>
          </div>
        }
      />
      <Card className="anim-rise min-h-[480px] overflow-hidden p-2" style={{ animationDelay: "0.05s" }}>
        <div ref={hostRef} className="min-h-[480px]" />
        {failed && (
          <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-[13.5px] font-semibold text-ink">{t("文档渲染器加载失败")}</p>
            <p className="max-w-md text-[12.5px] text-ink-mute">
              {t("Scalar 渲染器需要访问 CDN。你可以直接下载 openapi.json 导入 Postman / Apifox 查看。")}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
