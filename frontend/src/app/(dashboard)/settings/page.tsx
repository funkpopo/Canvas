"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useLanguage } from "@/shared/i18n/language-provider";
import { useI18n } from "@/shared/i18n/i18n";
import { useTheme } from "@/shared/theme/theme-provider";

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const [draftLanguage, setDraftLanguage] = useState<"en" | "zh">(language);
  const [draftTheme, setDraftTheme] = useState<"light" | "dark">(theme);

  useEffect(() => setDraftLanguage(language), [language]);
  useEffect(() => setDraftTheme(theme), [theme]);

  const hasChanges = useMemo(
    () => draftLanguage !== language || draftTheme !== theme,
    [draftLanguage, draftTheme, language, theme],
  );

  function handleSave() {
    if (draftLanguage !== language) setLanguage(draftLanguage);
    if (draftTheme !== theme) setTheme(draftTheme);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("global")}
        title={t("globalSettings.title")}
        description={t("globalSettings.description")}
        actions={
          <Button onClick={handleSave} disabled={!hasChanges}>
            {t("actions.save")}
          </Button>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("language.sectionTitle")}</CardTitle>
          <CardDescription>{t("language.sectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>{t("language.label")}</label>
          <select
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            value={draftLanguage}
            onChange={(e) => setDraftLanguage(e.target.value as "en" | "zh")}
          >
            <option value="en">{t("language.en")}</option>
            <option value="zh">{t("language.zh")}</option>
          </select>
        </CardContent>
      </Card>

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("appearance.sectionTitle")}</CardTitle>
          <CardDescription>{t("appearance.sectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>{t("appearance.label")}</label>
          <div className="flex gap-3">
            <button
              className={`rounded-md border px-3 py-2 text-sm ${draftTheme === "light" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setDraftTheme("light")}
            >
              {t("appearance.light")}
            </button>
            <button
              className={`rounded-md border px-3 py-2 text-sm ${draftTheme === "dark" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setDraftTheme("dark")}
            >
              {t("appearance.dark")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

