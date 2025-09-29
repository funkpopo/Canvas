"use client";

import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/shared/theme/theme-provider";
import { Button } from "@/shared/ui/button";
import { badgePresets } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n/i18n";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useI18n();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className={cn(`gap-2 rounded-full ${badgePresets.tag}`, className)}
      aria-label={t("theme.toggle.aria", { mode: isDark ? t("appearance.light") : t("appearance.dark") })}
    >
      {isDark ? (
        <SunIcon className="h-3 w-3" aria-hidden />
      ) : (
        <MoonIcon className="h-3 w-3" aria-hidden />
      )}
      <span className={`hidden font-medium ${badgePresets.label} md:inline`}>
        {isDark ? t("appearance.light") : t("appearance.dark")}
      </span>
    </Button>
  );
}


