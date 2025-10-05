"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe, loginApi, type LoginRequest, type MeResponse, type TokenPairResponse } from "@/lib/api";

function saveTokens(t: TokenPairResponse) {
  try {
    localStorage.setItem("canvas.access_token", t.access_token);
    localStorage.setItem("canvas.refresh_token", t.refresh_token);
  } catch {}
}

function clearTokens() {
  try {
    localStorage.removeItem("canvas.access_token");
    localStorage.removeItem("canvas.refresh_token");
  } catch {}
}

export function useAuth() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const idleMinutes = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MIN ?? 30);
  const [lastActive, setLastActive] = useState<number>(() => Date.now());

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await fetchMe();
      setMe(m);
    } catch (e) {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Inactivity auto-logout
  useEffect(() => {
    function bump() { setLastActive(Date.now()); }
    if (typeof window !== "undefined") {
      window.addEventListener("mousemove", bump);
      window.addEventListener("keydown", bump);
      window.addEventListener("click", bump);
    }
    const t = setInterval(() => {
      if (!me) return;
      if (idleMinutes <= 0) return;
      const diffMin = (Date.now() - lastActive) / 60000;
      if (diffMin > idleMinutes) {
        clearTokens();
        setMe(null);
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    }, 30_000);
    return () => {
      clearInterval(t);
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", bump);
        window.removeEventListener("keydown", bump);
        window.removeEventListener("click", bump);
      }
    };
  }, [me, idleMinutes, lastActive]);

  const login = useCallback(async (cred: LoginRequest) => {
    const t = await loginApi(cred);
    saveTokens(t);
    await loadMe();
    return t;
  }, [loadMe]);

  const logout = useCallback(() => {
    clearTokens();
    setMe(null);
  }, []);

  return { me, loading, error, login, logout };
}
