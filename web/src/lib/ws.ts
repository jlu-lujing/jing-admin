import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import type { WsMessage } from "./types";
import { toast } from "../components/ui/Toast";
import { useAnnounce } from "./announce";

const MAX_RETRIES = 8;

/** 订阅 /api/ws：指数退避 + 熔断（8 次后停）+ 页面隐藏暂停 + 登出即断 */
export function useRealtime() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [online, setOnline] = useState<number | null>(null);
  const [circuitOpen, setCircuitOpen] = useState(false);
  const sockRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) {
      setOnline(null);
      setCircuitOpen(false);
      return;
    }
    let dead = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    let intentional = false;

    const connect = () => {
      if (dead) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/ws?token=${encodeURIComponent(token)}`);
      sockRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setCircuitOpen(false);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage;
          if (msg.type === "hello") {
            setOnline(msg.online ?? 0);
            return;
          }
          if (msg.type === "announce") {
            useAnnounce.getState().setBanner(msg.content ?? "");
            return;
          }
          if (msg.type === "message" && msg.title) {
            qc.invalidateQueries({ queryKey: ["messages"] });
            qc.invalidateQueries({ queryKey: ["messages-unread"] });
            toast.info(msg.title, msg.content);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (dead || intentional) return;
        if (retry >= MAX_RETRIES) {
          setCircuitOpen(true);
          return;
        }
        const delay = Math.min(30_000, 1000 * 2 ** retry);
        retry += 1;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        intentional = true;
        ws.close();
        intentional = false;
      };
    };

    const onVis = () => {
      if (document.hidden) {
        intentional = true;
        sockRef.current?.close();
        timer && clearTimeout(timer);
      } else {
        retry = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) connect();

    return () => {
      dead = true;
      intentional = true;
      clearTimeout(timer);
      sockRef.current?.close();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token, qc]);

  return { online, circuitOpen };
}
