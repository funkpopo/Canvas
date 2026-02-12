"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/auth-store";

/**
 * Zustand 版本的 AuthProvider：不再依赖 React Context，避免大范围重渲染。
 * 保留 `useAuth()` API 供现有页面/组件继续使用。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const verify = useAuthStore((s) => s.verify);

  useEffect(() => {
    void verify();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "token") void verify();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [verify]);

  return children;
}

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const loginAction = useAuthStore((s) => s.login);
  const logoutAction = useAuthStore((s) => s.logout);

  const login = useCallback(
    async (token: string, refreshToken?: string | null) => {
      await loginAction(token, refreshToken);
    },
    [loginAction]
  );

  const logout = useCallback(async () => {
    await logoutAction();
    queryClient.clear();
    router.replace("/login");
  }, [logoutAction, queryClient, router]);

  return useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      login,
      logout,
    }),
    [isAuthenticated, isLoading, user, login, logout]
  );
}
