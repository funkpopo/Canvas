"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authApi } from "@/lib/api";
import { useClusterStore } from "@/lib/store/cluster-store";

export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  verify: () => Promise<void>;
  login: (token: string, refreshToken?: string | null) => Promise<void>;
  logout: (opts?: { revokeServerSession?: boolean }) => Promise<void>;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  refreshAccessToken: () => Promise<string | null>;
  getValidAccessToken: (opts?: { skewSeconds?: number }) => Promise<string | null>;
  _clearClientSession: () => void;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isJwtExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") return true; // 无 exp 时按过期处理（更安全）
  const now = Math.floor(Date.now() / 1000);
  return exp <= now + skewSeconds;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      isLoading: true,
      isAuthenticated: false,

      setToken: (token) => {
        if (token) {
          localStorage.setItem("token", token);
        } else {
          localStorage.removeItem("token");
        }
        set({ token });
      },

      setRefreshToken: (refreshToken) => {
        if (refreshToken) {
          localStorage.setItem("refresh_token", refreshToken);
        } else {
          localStorage.removeItem("refresh_token");
        }
        set({ refreshToken });
      },

      _clearClientSession: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("canvas_auth");
        localStorage.removeItem("canvas_cluster");

        useClusterStore.setState({
          clusters: [],
          activeClusterId: null,
          isLoading: false,
          wsConnected: false,
          wsConnecting: false,
          wsPolling: false,
          wsError: null,
          resourceUpdates: [],
        });

        set({ token: null, refreshToken: null, user: null, isAuthenticated: false, isLoading: false });
      },

      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken ?? localStorage.getItem("refresh_token");
        if (!refreshToken) return null;

        const resp = await authApi.refreshToken(refreshToken);
        if (resp.data?.access_token) {
          get().setToken(resp.data.access_token);
          return resp.data.access_token;
        }
        // refresh 失败：清理本地态，要求重新登录
        void get().logout({ revokeServerSession: false });
        return null;
      },

      getValidAccessToken: async (opts) => {
        const skewSeconds = opts?.skewSeconds ?? 30;
        const token = get().token ?? localStorage.getItem("token");
        if (!token) return null;
        if (!isJwtExpired(token, skewSeconds)) return token;
        const refreshed = await get().refreshAccessToken();
        if (!refreshed) void get().logout({ revokeServerSession: false });
        return refreshed;
      },

      verify: async () => {
        const token = get().token ?? localStorage.getItem("token");
        const refreshToken = get().refreshToken ?? localStorage.getItem("refresh_token");

        if (!token) {
          set({ token: null, refreshToken: refreshToken ?? null, user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        // 确保 store 与 localStorage 一致（API client 可能依赖 localStorage token）
        if (get().token !== token) set({ token });
        if (refreshToken && get().refreshToken !== refreshToken) set({ refreshToken });

        set({ isLoading: true });
        try {
          // 过期则尝试刷新（避免 verify-token 直接 401）
          if (refreshToken && isJwtExpired(token, 30)) {
            const refreshed = await get().refreshAccessToken();
            if (!refreshed) {
              get()._clearClientSession();
              return;
            }
          }

          let result = await authApi.verifyToken();

          // verify 失败时，再尝试一次 refresh -> verify（容忍服务端时钟偏差等）
          if ((!result.valid || !result.username) && refreshToken) {
            const refreshed = await get().refreshAccessToken();
            if (refreshed) {
              result = await authApi.verifyToken();
            }
          }

          if (result.valid && result.username) {
            set({
              isAuthenticated: true,
              user: {
                id: result.id || 0,
                username: result.username,
                email: result.email,
                role: result.role || "user",
                is_active: result.is_active !== undefined ? result.is_active : true,
              },
            });
          } else {
            get()._clearClientSession();
          }
        } catch {
          get()._clearClientSession();
        } finally {
          set({ isLoading: false });
        }
      },

      login: async (token: string, refreshToken?: string | null) => {
        get().setToken(token);
        if (refreshToken) get().setRefreshToken(refreshToken);
        await get().verify();
      },

      logout: async (opts) => {
        const shouldRevoke = opts?.revokeServerSession ?? true;
        const token = get().token ?? localStorage.getItem("token");
        const refreshToken = get().refreshToken ?? localStorage.getItem("refresh_token");

        if (shouldRevoke && token && refreshToken) {
          try {
            await authApi.logout(refreshToken);
          } catch {
            // 服务端撤销失败不应阻塞本地退出
          }
        }

        get()._clearClientSession();
      },
    }),
    {
      name: "canvas_auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken }),
    }
  )
);
