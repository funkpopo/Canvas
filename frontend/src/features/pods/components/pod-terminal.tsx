"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/i18n";

// Lazy import xterm on client only
let XTerm: any = null;
let FitAddonMod: any = null;
const loadXterm = async () => {
  if (!XTerm) {
    const mod = await import("@xterm/xterm");
    XTerm = mod.Terminal;
  }
  if (!FitAddonMod) {
    FitAddonMod = (await import("@xterm/addon-fit")).FitAddon;
  }
};

interface PodTerminalProps {
  wsBase: string; // e.g., ws://localhost:8000
  namespace: string;
  name: string;
  container?: string;
  cmd?: string; // default "/bin/sh"
}

export function PodTerminal({ wsBase, namespace, name, container, cmd = "/bin/sh" }: PodTerminalProps) {
  const { t } = useI18n();
  const divRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);

  const url = useMemo(() => {
    const u = new URL(`${wsBase}/ws/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec`);
    if (container) u.searchParams.set("container", container);
    if (cmd) u.searchParams.set("cmd", cmd);
    return u.toString().replace(/^http/, "ws").replace(/^https/, "wss");
  }, [wsBase, namespace, name, container, cmd]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;

    (async () => {
      await loadXterm();
      if (disposed) return;
      const term = new XTerm({
        rows: 24,
        convertEol: true,
        cursorBlink: true,
        fontSize: 12,
      });
      const fit = new FitAddonMod();
      term.loadAddon(fit);
      termRef.current = term;
      fitRef.current = fit;
      if (divRef.current) {
        term.open(divRef.current);
        try { fit.fit(); } catch {}
      }

      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        term.focus();
      };
      ws.onmessage = (ev) => {
        const data = typeof ev.data === "string" ? ev.data : "";
        term.write(data);
      };
      ws.onerror = () => {
        setConnected(false);
      };
      ws.onclose = () => {
        setConnected(false);
      };

      const disp = term.onData((d: string) => {
        try { ws?.send(d); } catch {}
      });

      const onResize = () => {
        try { fit.fit(); } catch {}
      };
      window.addEventListener("resize", onResize);

      // Cleanup
      return () => {
        window.removeEventListener("resize", onResize);
        try { disp.dispose(); } catch {}
        try { term.dispose(); } catch {}
        try { ws?.close(); } catch {}
      };
    })();

    return () => {
      disposed = true;
      try { termRef.current?.dispose?.(); } catch {}
      try { (ws as any)?.close?.(); } catch {}
    };
  }, [url]);

  return (
    <div className="space-y-2">
      <div className="text-xs text-text-muted">{connected ? t("pod.term.connected") : t("pod.term.disconnected")}</div>
      <div ref={divRef} className="h-80 rounded border border-border bg-surface-raised p-1" />
    </div>
  );
}
