"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useTranslations } from "@/hooks/use-translations";

export interface ResourceListHeaderProps {
  selectedClusterId: number | null;
  onClusterChange: (clusterId: number | null) => void;
  namespaces: string[];
  selectedNamespace: string;
  onNamespaceChange: (namespace: string) => void;
  showNamespaceInHeader: boolean;
  namespaceSource: "api" | "data";
  requireNamespace: boolean;
  allowAllNamespaces: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}

export function ResourceListHeader({
  selectedClusterId,
  onClusterChange,
  namespaces,
  selectedNamespace,
  onNamespaceChange,
  showNamespaceInHeader,
  namespaceSource,
  requireNamespace,
  allowAllNamespaces,
  isFetching,
  onRefresh,
}: ResourceListHeaderProps) {
  const t = useTranslations("resourceList");
  const namespaceValue = allowAllNamespaces ? selectedNamespace || "all" : selectedNamespace;
  const showHeaderNamespace = (showNamespaceInHeader || namespaceSource === "data") && namespaces.length > 0;
  const showApiNamespace = !showNamespaceInHeader && namespaceSource === "api" && requireNamespace;

  return (
    <header className="bg-card shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <ArrowLeft className="h-5 w-5 mr-2" />
              <span className="text-gray-600 dark:text-gray-400">{t("backToDashboard")}</span>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <ClusterSelector
              value={selectedClusterId?.toString() || ""}
              onValueChange={(value) => onClusterChange(value ? parseInt(value) : null)}
            />
            {showHeaderNamespace && (
              <Select
                value={namespaceValue || undefined}
                onValueChange={(value) => onNamespaceChange(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("selectNamespace")} />
                </SelectTrigger>
                <SelectContent>
                  {allowAllNamespaces && <SelectItem value="all">{t("allNamespaces")}</SelectItem>}
                  {namespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {showApiNamespace && (
              <Select
                value={namespaceValue || undefined}
                onValueChange={(value) => onNamespaceChange(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder={t("selectNamespace")} />
                </SelectTrigger>
                <SelectContent>
                  {allowAllNamespaces && <SelectItem value="all">{t("allNamespaces")}</SelectItem>}
                  {namespaces.map((ns) => (
                    <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={onRefresh} variant="outline" disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
