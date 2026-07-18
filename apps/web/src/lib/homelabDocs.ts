import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export type HomelabAttentionSeverity = "info" | "warning" | "critical";

export type HomelabAttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: HomelabAttentionSeverity;
  href?: string;
};

export type HomelabDocSummary = {
  id: string;
  title: string;
  category: string;
  relativePath: string;
  updatedAt: string | null;
};

export type HomelabDocument = HomelabDocSummary & {
  content: string;
  lastRefreshed: string | null;
};

export type HomelabService = {
  id: string;
  name: string;
  purpose: string;
  unit: string;
  status: string;
  ports: string[];
  localUrl?: string;
  tailscaleUrl?: string;
  command?: string;
  docId: string;
  lastChecked: string | null;
};

export type HomelabSnapshot = {
  docsRoot: string;
  generatedAt: string | null;
  system: {
    hostname: string;
    os: string;
    kernel: string;
    uptime: string;
    rootFilesystem: string;
    memory: string;
  };
  network: {
    lanIp: string;
    tailscaleIp: string;
    gateway: string;
    primaryInterface: string;
    tailscaleHealth: string[];
  };
  services: HomelabService[];
  attention: HomelabAttentionItem[];
  docs: {
    total: number;
    snapshots: number;
    latestSnapshot: string | null;
  };
};

type ServiceDefinition = {
  id: string;
  name: string;
  purpose: string;
  unit: string;
  docs: string;
  ports: string[];
  urlPort?: string;
  urlPath?: string;
  command?: (tailscaleIp: string) => string;
};

const HOMELAB_DOCS_ROOT =
  process.env.HOMELAB_DOCS_ROOT ?? "/home/vcovelli/homelab-docs";

const liveDocs = {
  system: "live/system.md",
  network: "live/network.md",
  ports: "live/ports.md",
  services: "live/services.md",
  health: "monitoring/health.md",
};

const documentCategories = [
  "live",
  "services",
  "infrastructure",
  "monitoring",
  "manual",
  "assets",
  "snapshots",
];

const serviceDefinitions: ServiceDefinition[] = [
  {
    id: "pihole",
    name: "Pi-hole",
    purpose: "DNS filtering and local admin",
    unit: "pihole-FTL",
    docs: "services/pihole.md",
    ports: ["53", "8080", "8443"],
    urlPort: "8080",
    urlPath: "/admin/",
  },
  {
    id: "jellyfin",
    name: "Jellyfin",
    purpose: "Video media server",
    unit: "jellyfin",
    docs: "services/jellyfin.md",
    ports: ["8096", "7359"],
    urlPort: "8096",
  },
  {
    id: "navidrome",
    name: "Navidrome",
    purpose: "Music server",
    unit: "navidrome",
    docs: "services/navidrome.md",
    ports: ["4533"],
    urlPort: "4533",
  },
  {
    id: "jarvis",
    name: "Jarvis",
    purpose: "Personal operations dashboard",
    unit: "jarvis-web",
    docs: "services/jarvis-web.md",
    ports: ["3000"],
    urlPort: "3000",
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    purpose: "Application database",
    unit: "postgresql@16-main",
    docs: "services/postgresql.md",
    ports: ["5432"],
  },
  {
    id: "nginx",
    name: "Nginx",
    purpose: "Reverse proxy and web server",
    unit: "nginx",
    docs: "services/nginx.md",
    ports: ["80", "443"],
    urlPort: "80",
  },
  {
    id: "tailscale",
    name: "Tailscale",
    purpose: "Private overlay network",
    unit: "tailscaled",
    docs: "services/tailscale.md",
    ports: ["41641"],
  },
  {
    id: "ssh",
    name: "SSH",
    purpose: "Remote administration",
    unit: "ssh",
    docs: "services/ssh.md",
    ports: ["38043"],
    command: (tailscaleIp) => `ssh -p 38043 vcovelli@${tailscaleIp}`,
  },
  {
    id: "docker",
    name: "Docker",
    purpose: "Container engine",
    unit: "docker",
    docs: "services/docker.md",
    ports: [],
  },
  {
    id: "wolow",
    name: "Wolow Companion",
    purpose: "Remote power-control service",
    unit: "wolow-companion",
    docs: "services/wolow.md",
    ports: ["20388"],
  },
];

export const getHomelabSnapshot = cache(getFreshHomelabSnapshot);

export async function getFreshHomelabSnapshot(): Promise<HomelabSnapshot> {
  const [systemDoc, networkDoc, servicesDoc, healthDoc, docsIndex] = await Promise.all([
    readDoc(liveDocs.system),
    readDoc(liveDocs.network),
    readDoc(liveDocs.services),
    readDoc(liveDocs.health),
    getHomelabDocIndex(),
  ]);

  const system = {
    hostname: extractBulletValue(systemDoc, "Hostname") ?? "covelli-server",
    os: extractHostInfo(systemDoc, "Operating System") ?? "Ubuntu 24.04.2 LTS",
    kernel: extractHostInfo(systemDoc, "Kernel") ?? "Linux 6.8",
    uptime: firstLine(extractCodeBlockAfterHeading(systemDoc, "Uptime")) ?? "Unknown",
    rootFilesystem:
      firstDataLine(extractCodeBlockAfterHeading(healthDoc, "Root filesystem")) ??
      "Unknown",
    memory: firstDataLine(extractCodeBlockAfterHeading(healthDoc, "Memory")) ?? "Unknown",
  };
  const network = {
    lanIp: extractBulletValue(networkDoc, "LAN IPv4") ?? "192.168.1.42",
    tailscaleIp: extractBulletValue(networkDoc, "Tailscale IPv4") ?? "100.115.58.56",
    gateway: extractBulletValue(networkDoc, "Default gateway") ?? "Unknown",
    primaryInterface: extractBulletValue(networkDoc, "Primary interface") ?? "Unknown",
    tailscaleHealth: extractTailscaleHealth(networkDoc),
  };
  const statusByUnit = parseServiceStatuses(servicesDoc, healthDoc);
  const services = serviceDefinitions.map((definition) =>
    buildService(definition, statusByUnit, network.lanIp, network.tailscaleIp),
  );
  const generatedAt =
    extractLastRefreshed(healthDoc) ??
    extractLastRefreshed(systemDoc) ??
    extractLastRefreshed(servicesDoc);

  return {
    docsRoot: HOMELAB_DOCS_ROOT,
    generatedAt,
    system,
    network,
    services,
    attention: buildAttentionItems({
      generatedAt,
      healthDoc,
      network,
      services,
      rootFilesystem: system.rootFilesystem,
    }),
    docs: {
      total: docsIndex.length,
      snapshots: docsIndex.filter((doc) => doc.category === "snapshots").length,
      latestSnapshot: getLatestSnapshot(docsIndex),
    },
  };
}

export const getHomelabDocIndex = cache(async (): Promise<HomelabDocSummary[]> => {
  const groups = await Promise.all(
    documentCategories.map(async (category) => listMarkdownDocs(category)),
  );
  return groups
    .flat()
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
});

export async function getHomelabDocument(id?: string | null) {
  const index = await getHomelabDocIndex();
  const normalized = normalizeDocId(id) ?? "README.md";
  const selected =
    index.find((doc) => doc.id === normalized) ??
    index.find((doc) => doc.id === "live/system.md") ??
    index[0];
  if (!selected) return null;
  const content = await readDoc(selected.id);
  return {
    ...selected,
    content,
    lastRefreshed: extractLastRefreshed(content),
  } satisfies HomelabDocument;
}

export async function searchHomelabDocs(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const index = await getHomelabDocIndex();
  const matches: HomelabDocSummary[] = [];
  for (const doc of index) {
    const content = await readDoc(doc.id);
    const haystack = `${doc.title} ${doc.relativePath} ${content}`.toLowerCase();
    if (haystack.includes(normalized)) {
      matches.push(doc);
    }
    if (matches.length >= 24) break;
  }
  return matches;
}

export function groupDocsByCategory(docs: HomelabDocSummary[]) {
  return docs.reduce<Record<string, HomelabDocSummary[]>>((groups, doc) => {
    groups[doc.category] = [...(groups[doc.category] ?? []), doc];
    return groups;
  }, {});
}

export function severityTone(severity: HomelabAttentionSeverity) {
  switch (severity) {
    case "critical":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  }
}

function buildService(
  definition: ServiceDefinition,
  statusByUnit: Map<string, string>,
  lanIp: string,
  tailscaleIp: string,
): HomelabService {
  const status = statusByUnit.get(definition.unit) ?? "unknown";
  const urlPath = definition.urlPath ?? "/";
  const localUrl = definition.urlPort
    ? formatServiceUrl(lanIp, definition.urlPort, urlPath)
    : undefined;
  const tailscaleUrl = definition.urlPort
    ? formatServiceUrl(tailscaleIp, definition.urlPort, urlPath)
    : undefined;

  return {
    id: definition.id,
    name: definition.name,
    purpose: definition.purpose,
    unit: definition.unit,
    status,
    ports: definition.ports,
    localUrl,
    tailscaleUrl,
    command: definition.command?.(tailscaleIp),
    docId: definition.docs,
    lastChecked: null,
  };
}

function buildAttentionItems({
  generatedAt,
  healthDoc,
  network,
  services,
  rootFilesystem,
}: {
  generatedAt: string | null;
  healthDoc: string;
  network: HomelabSnapshot["network"];
  services: HomelabService[];
  rootFilesystem: string;
}): HomelabAttentionItem[] {
  const items: HomelabAttentionItem[] = [];
  const inactiveServices = services.filter((service) => service.status !== "active");
  if (inactiveServices.length) {
    items.push({
      id: "inactive-services",
      title: `${inactiveServices.length} expected service${inactiveServices.length === 1 ? "" : "s"} not active`,
      detail: inactiveServices.map((service) => service.name).join(", "),
      severity: "critical",
      href: "/v2/services",
    });
  }

  const rootUse = extractUsePercent(rootFilesystem);
  if (rootUse !== null && rootUse >= 85) {
    items.push({
      id: "root-storage",
      title: `Root filesystem is ${rootUse}% used`,
      detail: "Review storage before package updates or media growth push the disk into a failure zone.",
      severity: rootUse >= 92 ? "critical" : "warning",
      href: "/v2/documentation?doc=live/storage.md",
    });
  }

  if (network.tailscaleHealth.length) {
    items.push({
      id: "tailscale-health",
      title: "Tailscale reported a health warning",
      detail: network.tailscaleHealth[0],
      severity: "warning",
      href: "/v2/documentation?doc=live/network.md",
    });
  }

  const failedServiceBlock = extractCodeBlockAfterHeading(healthDoc, "Failed services");
  if (failedServiceBlock && !failedServiceBlock.includes("0 loaded units listed")) {
    items.push({
      id: "failed-services",
      title: "Failed service units detected",
      detail: firstDataLine(failedServiceBlock) ?? "Open health documentation for details.",
      severity: "critical",
      href: "/v2/documentation?doc=monitoring/health.md",
    });
  }

  if (generatedAt && isOlderThanHours(generatedAt, 24)) {
    items.push({
      id: "stale-docs",
      title: "Homelab docs are stale",
      detail: `Last refresh: ${generatedAt}`,
      severity: "warning",
      href: "/v2/documentation",
    });
  }

  if (!items.length) {
    items.push({
      id: "healthy",
      title: "No failed service units",
      detail: "Generated docs show the expected application services active.",
      severity: "info",
      href: "/v2/services",
    });
  }
  return items;
}

async function listMarkdownDocs(category: string): Promise<HomelabDocSummary[]> {
  const categoryRoot = path.join(HOMELAB_DOCS_ROOT, category);
  const files = await walkMarkdown(categoryRoot).catch(() => []);
  return Promise.all(
    files.map(async (filePath) => {
      const relativePath = path.relative(HOMELAB_DOCS_ROOT, filePath).split(path.sep).join("/");
      const fileStat = await stat(filePath).catch(() => null);
      return {
        id: relativePath,
        title: titleFromPath(relativePath),
        category,
        relativePath,
        updatedAt: fileStat ? fileStat.mtime.toISOString() : null,
      };
    }),
  );
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkMarkdown(entryPath);
      return entry.name.endsWith(".md") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

async function readDoc(relativePath: string) {
  const normalized = normalizeDocId(relativePath);
  if (!normalized) return "";
  return readFile(path.join(HOMELAB_DOCS_ROOT, normalized), "utf8").catch(() => "");
}

function normalizeDocId(value?: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.endsWith(".md")) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

function titleFromPath(relativePath: string) {
  const base = relativePath.split("/").at(-1)?.replace(/\.md$/, "") ?? relativePath;
  if (base.toLowerCase() === "readme") {
    const parent = relativePath.split("/").at(-2);
    return parent ? titleCase(parent) : "Overview";
  }
  return titleCase(base.replace(/-/g, " "));
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractLastRefreshed(markdown: string) {
  const match = markdown.match(/_Last refreshed:\s*([^_]+)_/);
  return match?.[1]?.trim() ?? null;
}

function extractBulletValue(markdown: string, label: string) {
  const pattern = new RegExp(`- \\*\\*${escapeRegex(label)}:\\*\\*\\s*(.+)`);
  const match = markdown.match(pattern);
  return stripMarkdown(match?.[1] ?? "");
}

function extractHostInfo(markdown: string, label: string) {
  const pattern = new RegExp(`${escapeRegex(label)}:\\s*(.+)`);
  const match = markdown.match(pattern);
  return stripMarkdown(match?.[1] ?? "");
}

function extractCodeBlockAfterHeading(markdown: string, heading: string) {
  const section = extractSection(markdown, heading);
  const match = section.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}

function extractSection(markdown: string, heading: string) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  const match = headingPattern.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const next = markdown.slice(start).search(/^##\s+/m);
  return next === -1 ? markdown.slice(start) : markdown.slice(start, start + next);
}

function parseServiceStatuses(servicesDoc: string, healthDoc: string) {
  const statuses = new Map<string, string>();
  parseMarkdownTable(extractSection(servicesDoc, "Known application services")).forEach((row) => {
    const unit = row.Service?.trim();
    const state = row.State?.trim();
    if (unit && state) statuses.set(unit, state);
  });
  const serviceSummary = extractCodeBlockAfterHeading(healthDoc, "Service status summary");
  serviceSummary?.split("\n").forEach((line) => {
    const match = line.trim().match(/^(\S+?)(?:\.service)?\s+(\S+)$/);
    if (match?.[1] && match[2]) {
      statuses.set(match[1], match[2]);
    }
  });
  return statuses;
}

function parseMarkdownTable(section: string) {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (lines.length < 3) return [];
  const headers = splitTableRow(lines[0]);
  return lines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = stripMarkdown(cells[index] ?? "");
      return row;
    }, {});
  });
}

function splitTableRow(line: string) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function extractTailscaleHealth(markdown: string) {
  const section = extractSection(markdown, "Tailscale");
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("#     -"))
    .map((line) => line.replace(/^#\s+-\s*/, "").replace(/^-\s*/, "").trim());
}

function firstLine(value: string | null) {
  return value?.split("\n").map((line) => line.trim()).find(Boolean) ?? null;
}

function firstDataLine(value: string | null) {
  if (!value) return null;
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !/^Filesystem|^Mem:|^Swap:/.test(line)) ?? lines[0] ?? null;
}

function formatServiceUrl(host: string, port: string, urlPath: string) {
  const suffix = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  if (port === "80") return `http://${host}${suffix}`;
  if (port === "443") return `https://${host}${suffix}`;
  return `http://${host}:${port}${suffix}`;
}

function extractUsePercent(line: string) {
  const match = line.match(/\s(\d+)%\s/);
  return match ? Number(match[1]) : null;
}

function isOlderThanHours(value: string, hours: number) {
  const parsed = new Date(value.replace(" UTC", "Z"));
  if (Number.isNaN(parsed.valueOf())) return false;
  return Date.now() - parsed.valueOf() > hours * 60 * 60 * 1000;
}

function getLatestSnapshot(docs: HomelabDocSummary[]) {
  const snapshots = docs
    .filter((doc) => doc.category === "snapshots")
    .map((doc) => doc.relativePath.split("/")[1])
    .filter(Boolean)
    .sort();
  return snapshots.at(-1) ?? null;
}

function stripMarkdown(value: string) {
  return value.replace(/[`*_]/g, "").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
