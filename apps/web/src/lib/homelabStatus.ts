export type DockerContainerState = {
  name: string;
  rawStatus: string;
  status: "active" | "starting" | "unhealthy" | "restarting" | "paused" | "inactive" | "unknown";
};

export function parseDockerContainerStatuses(table: string) {
  const statuses = new Map<string, DockerContainerState>();
  for (const line of table.split("\n").slice(1)) {
    const columns = line.trim().split(/\s{2,}/).filter(Boolean);
    if (columns.length < 5) continue;
    const rawStatus = columns.find((column) => /^(Up|Exited|Created|Restarting|Paused|Dead|Removal In Progress)\b/i.test(column));
    const name = columns.at(-1);
    if (!name || !rawStatus) continue;
    statuses.set(name.toLowerCase(), {
      name,
      rawStatus,
      status: normalizeDockerContainerStatus(rawStatus),
    });
  }
  return statuses;
}

export function normalizeDockerContainerStatus(status: string): DockerContainerState["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized.startsWith("restarting")) return "restarting";
  if (normalized.includes("(unhealthy)")) return "unhealthy";
  if (normalized.includes("health: starting")) return "starting";
  if (normalized.includes("paused")) return "paused";
  if (normalized.startsWith("up ") || normalized === "up") return "active";
  if (normalized.startsWith("exited") || normalized.startsWith("created") || normalized.startsWith("dead")) return "inactive";
  return "unknown";
}
