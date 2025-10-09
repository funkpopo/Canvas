"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/i18n";

interface PodLogsProps {
  apiBase: string; // e.g., http://localhost:8000
  namespace: string;
  name: string;
  container?: string;
}

export function PodLogs({ apiBase, namespace, name, container }: PodLogsProps) {
  const { t } = useI18n();
  const [follow, setFollow] = useState(true);
  const [tail, setTail] = useState<number | undefined>(500);
  const [since, setSince] = useState<number | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string>("");
  const preRef = useRef<HTMLPreElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const url = useMemo(() => {
    const u = new URL(`${apiBase}/api/v1/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`);
    if (container) u.searchParams.set("container", container);
    if (follow) u.searchParams.set("follow", "true");
    if (tail !== undefined) u.searchParams.set("tailLines", String(tail));
    if (since !== undefined) u.searchParams.set("sinceSeconds", String(since));
    return u.toString();
  }, [apiBase, namespace, name, container, follow, tail, since]);

  useEffect(() => {
    if (!follow && tail === undefined && since === undefined) {
      // Avoid fetching indefinite full logs unintentionally
      return;
    }
    controllerRef.current?.abort();
    const ac = new AbortController();
    controllerRef.current = ac;
    setIsStreaming(true);
    setError("");

    (async () => {
      try {
        // Attach auth header using stored access token
        let token: string | null = null;
        try {
          if (typeof window !== "undefined") {
            token = window.localStorage.getItem("canvas.access_token");
          }
        } catch {}
        const res = await fetch(url, {
          signal: ac.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          // Surface error text instead of streaming JSON error into the pre block
          const msg = await res.text();
          throw new Error(msg || `HTTP ${res.status}`);
        }
        if (!res.body) {
          throw new Error(`No response body`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        // Clear previous content
        if (preRef.current) preRef.current.textContent = "";
        // Stream append
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (preRef.current) {
            preRef.current.textContent += text;
            preRef.current.scrollTop = preRef.current.scrollHeight;
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError((e as Error)?.message || String(e));
        }
      } finally {
        setIsStreaming(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [url, follow, tail, since]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          {t("pod.logs.follow")}
        </label>
        <label className="flex items-center gap-2">
          {t("pod.logs.tail")}
          <input
            type="number"
            className="w-24 rounded border border-border bg-surface px-2 py-1"
            value={tail ?? ""}
            placeholder="500"
            onChange={(e) => {
              const v = e.target.value.trim();
              setTail(v === "" ? undefined : Number(v));
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          {t("pod.logs.since")}
          <input
            type="number"
            className="w-24 rounded border border-border bg-surface px-2 py-1"
            value={since ?? ""}
            placeholder=""
            onChange={(e) => {
              const v = e.target.value.trim();
              setSince(v === "" ? undefined : Number(v));
            }}
          />
        </label>
      </div>
      {error && <div className="text-sm text-red-500">{error}</div>}
      <pre
        ref={preRef}
        className="h-80 overflow-auto rounded border border-border bg-surface-raised p-3 text-xs text-text-primary"
      />
      {isStreaming && <div className="text-xs text-text-muted">{t("pod.logs.streaming")}</div>}
    </div>
  );
}
