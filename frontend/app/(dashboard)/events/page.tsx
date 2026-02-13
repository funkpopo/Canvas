"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

import { eventApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import {
  ResourceList,
  BaseResource,
  ColumnDef,
  ApiResponse,
} from "@/components/ResourceList";

interface EventRow extends BaseResource {
  type: string;
  reason: string;
  message: string;
  source: string | null;
  count: number;
  first_timestamp: string | null;
  last_timestamp: string | null;
  involved_object: {
    kind: string;
    name: string;
    namespace: string;
  } | null;
}

function toEventRow(e: import("@/lib/api").Event): EventRow {
  return {
    id: `${e.cluster_id}-${e.namespace}-${e.name}-${e.reason}-${e.last_timestamp ?? ""}`,
    name: e.name,
    namespace: e.namespace,
    cluster_id: e.cluster_id,
    cluster_name: e.cluster_name,
    age: e.age,
    labels: undefined,
    type: e.type,
    reason: e.reason,
    message: e.message,
    source: e.source,
    count: e.count,
    first_timestamp: e.first_timestamp,
    last_timestamp: e.last_timestamp,
    involved_object: e.involved_object,
  };
}

async function fetchEventsPage(
  clusterId: number,
  namespace: string | undefined,
  continueToken: string | null,
  limit: number
): Promise<ApiResponse<{ items: EventRow[]; continue_token: string | null }>> {
  const result = await eventApi.getEvents(clusterId, namespace, limit, continueToken);
  if (result.data) {
    return {
      data: {
        items: result.data.items.map(toEventRow),
        continue_token: result.data.continue_token ?? null,
      },
    };
  }
  return { error: result.error };
}

function EventsPageContent() {
  const t = useTranslations("events");

  const columns: ColumnDef<EventRow>[] = useMemo(
    () => [
      {
        key: "type",
        header: t("type"),
        render: (item) => {
          const variant =
            item.type === "Warning" || item.type === "Error"
              ? "destructive"
              : item.type === "Normal"
              ? "default"
              : "secondary";
          const icon =
            item.type === "Warning" ? (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            ) : item.type === "Normal" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : item.type === "Error" ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Info className="h-4 w-4 text-blue-500" />
            );

          return (
            <div className="flex items-center gap-2">
              {icon}
              <Badge variant={variant}>{item.type}</Badge>
            </div>
          );
        },
      },
      { key: "reason", header: t("reason"), render: (item) => <span className="font-medium">{item.reason}</span> },
      {
        key: "object",
        header: t("object"),
        render: (item) => (
          <div className="text-sm">
            <div className="font-medium">
              {item.involved_object ? `${item.involved_object.kind}/${item.involved_object.name}` : "-"}
            </div>
            <div className="text-gray-500">{item.involved_object?.namespace ?? "-"}</div>
          </div>
        ),
      },
      {
        key: "message",
        header: t("message"),
        render: (item) => (
          <div className="max-w-xs truncate" title={item.message}>
            {item.message}
          </div>
        ),
      },
      { key: "source", header: t("source"), render: (item) => item.source || t("unknownSource") },
      { key: "count", header: t("count"), render: (item) => item.count },
      { key: "age", header: t("age"), render: (item) => item.age },
      { key: "cluster", header: t("cluster"), render: (item) => item.cluster_name },
    ],
    [t]
  );

  return (
    <ResourceList<EventRow>
      resourceType="Event"
      title={t("title")}
      description={t("descriptionPaged")}
      icon={Info}
      columns={columns}
      fetchPageFn={fetchEventsPage}
      requireNamespace={false}
      namespaceSource="data"
      showNamespaceInHeader={true}
      defaultViewMode="table"
      allowViewToggle={false}
      searchFields={["name", "namespace", "reason", "message"]}
      emptyText={t("noEvents")}
    />
  );
}

export default function EventsPage() {
  return <EventsPageContent />;
}
