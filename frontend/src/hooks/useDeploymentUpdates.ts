import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import { WS_ENDPOINTS, WebSocketMessage } from '@/lib/websocket';
import { queryKeys, WorkloadSummaryResponse } from '@/lib/api';

export function useDeploymentUpdates() {
  const queryClient = useQueryClient();
  const { status, subscribe, isConnected } = useWebSocket({
    url: WS_ENDPOINTS.deployments,
  });

  useEffect(() => {
    const unsubscribe = subscribe((message: WebSocketMessage) => {
      handleWebSocketMessage(message, queryClient);
    });

    return unsubscribe;
  }, [subscribe, queryClient]);

  return { status, isConnected };
}

function handleWebSocketMessage(
  message: WebSocketMessage,
  queryClient: ReturnType<typeof useQueryClient>
) {
  const { type, resource_type, namespace, name, data } = message;

  // Handle Deployment events
  if (resource_type === 'Deployment') {
    switch (type) {
      case 'deployment_added':
      case 'deployment_modified':
        // Update workloads cache
        queryClient.setQueryData<WorkloadSummaryResponse[]>(
          queryKeys.workloads,
          (oldData) => {
            if (!oldData) return oldData;

            const index = oldData.findIndex(
              (w) => w.kind === 'Deployment' && w.namespace === namespace && w.name === name
            );

            if (index >= 0 && data) {
              // Update existing deployment
              const updated = [...oldData];
              updated[index] = {
                ...updated[index],
                replicas_desired: data.replicas_desired ?? updated[index].replicas_desired,
                replicas_ready: data.replicas_ready ?? updated[index].replicas_ready,
                status: data.status ?? updated[index].status,
                updated_at: data.updated_at ?? updated[index].updated_at,
              };
              return updated;
            } else if (type === 'deployment_added' && data) {
              // Add new deployment
              return [
                ...oldData,
                {
                  name,
                  namespace,
                  kind: 'Deployment' as const,
                  replicas_desired: data.replicas_desired ?? null,
                  replicas_ready: data.replicas_ready ?? null,
                  version: null,
                  status: data.status ?? 'Unknown',
                  updated_at: data.updated_at ?? null,
                },
              ];
            }

            return oldData;
          }
        );

        // Invalidate related queries and refetch immediately
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.deploymentPods(namespace, name),
          refetchType: 'active' // Refetch active queries immediately
        });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.deploymentYaml(namespace, name),
          refetchType: 'none' // YAML can stay stale until explicitly requested
        });
        break;

      case 'deployment_deleted':
        // Remove from workloads cache
        queryClient.setQueryData<WorkloadSummaryResponse[]>(
          queryKeys.workloads,
          (oldData) => {
            if (!oldData) return oldData;
            return oldData.filter(
              (w) => !(w.kind === 'Deployment' && w.namespace === namespace && w.name === name)
            );
          }
        );
        break;
    }
  }

  // Handle Pod events
  if (resource_type === 'Pod') {
    // Invalidate deployment pods queries for affected namespace and refetch
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'deployments' &&
          key[1] === namespace &&
          key[3] === 'pods'
        );
      },
      refetchType: 'active', // Refetch immediately for real-time updates
    });

    // Also invalidate pod detail queries and refetch
    queryClient.invalidateQueries({
      queryKey: queryKeys.podDetail(namespace, name),
      refetchType: 'active',
    });
  }
}
