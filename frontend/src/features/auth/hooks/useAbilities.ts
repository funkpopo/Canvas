"use client";

import { useQuery } from "@tanstack/react-query";
import { checkAuthzMatrix, queryKeys } from "@/lib/api";

export function useK8sAbilities(namespace?: string) {
  const { data } = useQuery({
    queryKey: ["authz", namespace ?? "all"],
    queryFn: async () => {
      if (!namespace) return { canDeletePods: true, canExecPods: true, canViewLogs: true };
      const checks = [
        { verb: "delete", resource: "pods", namespace },
        { verb: "create", resource: "pods", namespace, subresource: "exec" },
        { verb: "get", resource: "pods", namespace, subresource: "log" },
      ];
      const res = await checkAuthzMatrix(checks);
      return {
        canDeletePods: !!res[0],
        canExecPods: !!res[1],
        canViewLogs: !!res[2],
      };
    },
    staleTime: 30_000,
  });

  return data ?? { canDeletePods: true, canExecPods: true, canViewLogs: true };
}

