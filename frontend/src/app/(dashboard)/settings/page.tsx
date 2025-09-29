"use client";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { useLanguage } from "@/shared/i18n/language-provider";
import { useTheme } from "@/shared/theme/theme-provider";

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Global"
        title="Global settings"
        description="Set your language and appearance preferences."
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">Language</CardTitle>
          <CardDescription>Choose your preferred UI language.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>Language</label>
          <select
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "zh")}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </CardContent>
      </Card>

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">Appearance</CardTitle>
          <CardDescription>Switch between light and dark themes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>Theme</label>
          <div className="flex gap-3">
            <button
              className={`rounded-md border px-3 py-2 text-sm ${theme === "light" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              className={`rounded-md border px-3 py-2 text-sm ${theme === "dark" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
