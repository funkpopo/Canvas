import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";

export default function NodesPage() {
  const { t } = useI18n();
  // TODO: Replace with actual API call when nodes endpoint is available
  const totalNodes = 0;
  const readyNodes = 0;
  const spotInstances = 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("nodes.eyebrow")}
        title={t("nodes.title")}
        description={t("nodes.desc")}
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.ready")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{readyNodes}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.ready.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.spot")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{spotInstances}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.spot.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("nodes.meta.total")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{totalNodes}</p>
              <p className="text-xs text-text-muted">{t("nodes.meta.total.help")}</p>
            </div>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <p className="text-text-muted">{t("nodes.empty.title")}</p>
              <p className="text-xs text-text-muted">{t("nodes.empty.desc")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

