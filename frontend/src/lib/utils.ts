import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"] as const;
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(b >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMillicores(mcores: number | null | undefined): string {
  if (!mcores || mcores <= 0) return "0 cores";
  const cores = mcores / 1000;
  return cores >= 10 ? `${cores.toFixed(0)} cores` : `${cores.toFixed(1)} cores`;
}
