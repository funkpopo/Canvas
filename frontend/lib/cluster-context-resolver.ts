export type ClusterContextSource = "url" | "active_cluster" | "none";

export interface ClusterContextResolution {
  clusterId: number | null;
  source: ClusterContextSource;
}

export function resolveClusterContext(options: {
  clusterIdFromUrl?: string | null;
  activeClusterId?: number | null;
}): ClusterContextResolution {
  const fromUrl = parseClusterId(options.clusterIdFromUrl);
  if (fromUrl !== null) {
    return { clusterId: fromUrl, source: "url" };
  }

  const fromActive = normalizeClusterId(options.activeClusterId);
  if (fromActive !== null) {
    return { clusterId: fromActive, source: "active_cluster" };
  }

  return { clusterId: null, source: "none" };
}

export function withClusterId(path: string, clusterId: number | null | undefined): string {
  const normalized = normalizeClusterId(clusterId);
  if (normalized === null) {
    return path;
  }

  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("cluster_id", String(normalized));
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function parseClusterId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeClusterId(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}
