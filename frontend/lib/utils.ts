import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 权限检查工具函数
export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
}

export function canManageClusters(user: UserInfo | null): boolean {
  return user?.role === 'admin';
}

export function canManageUsers(user: UserInfo | null): boolean {
  return user?.role === 'admin';
}

export function canManageConfigMaps(user: UserInfo | null): boolean {
  return user?.role === 'admin';
}

export function canManageResourceQuotas(user: UserInfo | null): boolean {
  return user?.role === 'admin';
}

export function canManageRBAC(user: UserInfo | null): boolean {
  return user?.role === 'admin';
}

export function canManageResources(user: UserInfo | null): boolean {
  return user?.role === 'admin' || user?.role === 'user';
}

export function canViewOnly(user: UserInfo | null): boolean {
  return !!user; // 所有登录用户都可以查看
}
