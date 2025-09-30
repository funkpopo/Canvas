"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { useLanguage } from "@/shared/i18n/language-provider";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { queryKeys, fetchClusterConfig } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";

export function TopBar() {
  const { t } = useI18n();
  const { language, setLanguage } = useLanguage();
  const { data: config } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-4">
        <div>
          <p className={`${badgePresets.label} text-text-muted`}>{t("topbar.activeCluster")}</p>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-text-primary">
              {config?.name ?? t("topbar.noClusterConfigured")}
            </p>
            <Link
              href="/clusters"
              className="text-xs text-primary hover:underline"
            >
              {t("topbar.change")}
            </Link>
          </div>
        </div>
        {config?.api_server && (
          <Badge
            variant="success-light"
            size="sm"
            className={badgePresets.status}
          >
            {t("topbar.online")}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-4">
        <select
          aria-label={t("language.label")}
          value={language}
          onChange={(e) => setLanguage(e.target.value as any)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="en">{t("language.en")}</option>
          <option value="zh">{t("language.zh")}</option>
        </select>
        <ThemeToggle />
      </div>
    </header>
  );
}




