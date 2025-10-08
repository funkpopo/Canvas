"use client";

import { PropsWithChildren, useMemo, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";

export type Role = "viewer" | "operator" | "admin";

// 角色层级：admin(3) > operator(2) > viewer(1)
const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

/**
 * 检查用户角色是否满足权限要求
 * 高级别角色自动拥有低级别权限（例如：admin可以访问所有页面）
 */
function hasPermission(userRoles: string[], allowedRoles: Role[]): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  
  // 获取用户的最高角色等级
  const userMaxLevel = Math.max(
    ...userRoles
      .filter((role): role is Role => role in ROLE_HIERARCHY)
      .map((role) => ROLE_HIERARCHY[role])
  );
  
  // 获取所需的最低角色等级
  const requiredMinLevel = Math.min(
    ...allowedRoles.map((role) => ROLE_HIERARCHY[role])
  );
  
  // 用户的最高等级 >= 所需的最低等级即可通过
  return userMaxLevel >= requiredMinLevel;
}

export function AuthGate({ allow = ["viewer"], children }: PropsWithChildren<{ allow?: Role[] }>) {
  const { me, loading } = useAuth();
  const authorized = useMemo(() => {
    if (!me) return false;
    return hasPermission(me.roles, allow);
  }, [me, allow]);

  useEffect(() => {
    if (!loading && !me && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
  }, [loading, me]);

  if (loading) {
    return null;
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-black/40">
        <div className="rounded-xl border border-[var(--canvas-border)] bg-black/60 px-8 py-6 text-center">
          <p className="text-sm text-[color:var(--canvas-muted)]">
            Your account does not have access to this area yet. Update role assignments in the administrative console.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
