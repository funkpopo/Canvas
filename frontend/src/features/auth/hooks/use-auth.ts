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

