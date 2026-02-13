// Flat solid color palette for charts (no gradients)
export const CHART_COLORS = [
  "#3b82f6", // blue-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#71717a", // zinc-500
];

export const CHART_COLORS_DARK = [
  "#60a5fa", // blue-400
  "#4ade80", // green-400
  "#fbbf24", // amber-400
  "#f87171", // red-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#f472b6", // pink-400
  "#a1a1aa", // zinc-400
];

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// Status-specific colors (flat, no gradient)
export const STATUS_COLORS = {
  running: "#22c55e",
  pending: "#f59e0b",
  failed: "#ef4444",
  succeeded: "#3b82f6",
  unknown: "#71717a",
};
