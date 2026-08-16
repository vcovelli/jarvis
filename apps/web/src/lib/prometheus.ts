import "server-only";

export type MonitoringStatus = "healthy" | "warning" | "critical" | "unknown";

export type MonitoringHistoryPoint = {
  ts: number;
  value: number;
};

export type MonitoringSummary = {
  available: boolean;
  generatedAt: string;
  status: MonitoringStatus;
  healthScore: number | null;
  grafanaUrl: string;
  targets: {
    prometheus: boolean;
    nodeExporter: boolean;
    processExporter: boolean;
  };
  metrics: {
    cpuUsagePercent: number | null;
    cpuTemperatureCelsius: number | null;
    memoryUsagePercent: number | null;
    rootDiskUsagePercent: number | null;
    hddUsagePercent: number | null;
    load1: number | null;
    uptimeSeconds: number | null;
    firingAlerts: number | null;
  };
  process: {
    jarvisProcessCount: number | null;
    nextDevProcessCount: number | null;
    jarvisCpuPercent: number | null;
    pm2CpuPercent: number | null;
  };
  network: {
    enp10s0: NetworkRates;
    tailscale0: NetworkRates;
  };
  history: {
    cpu: MonitoringHistoryPoint[];
    temperature: MonitoringHistoryPoint[];
    memory: MonitoringHistoryPoint[];
    rootDisk: MonitoringHistoryPoint[];
  };
};

type NetworkRates = {
  rxMbps: number | null;
  txMbps: number | null;
};

type PrometheusVectorResult = {
  metric: Record<string, string>;
  value: [number, string];
};

type PrometheusMatrixResult = {
  metric: Record<string, string>;
  values: Array<[number, string]>;
};

type PrometheusResponse<T> =
  | {
      status: "success";
      data: T;
    }
  | {
      status: "error";
      error?: string;
      errorType?: string;
    };

type PrometheusVectorData = {
  resultType: "vector";
  result: PrometheusVectorResult[];
};

type PrometheusMatrixData = {
  resultType: "matrix";
  result: PrometheusMatrixResult[];
};

const DEFAULT_PROMETHEUS_BASE_URL = "http://127.0.0.1:9090";
const DEFAULT_GRAFANA_BASE_URL = "http://100.115.58.56:3001";
const REQUEST_TIMEOUT_MS = 3_500;
const HISTORY_WINDOW_SECONDS = 60 * 60;
const HISTORY_STEP_SECONDS = 60;

const CPU_TCTL_QUERY =
  'max(node_hwmon_temp_celsius{job="node-exporter"} * on(instance,chip,sensor) group_left(label) node_hwmon_sensor_label{job="node-exporter",label="Tctl"})';

const QUERIES = {
  cpuUsage:
    '100 * (1 - avg(rate(node_cpu_seconds_total{job="node-exporter",mode="idle"}[5m])))',
  cpuTemperature: CPU_TCTL_QUERY,
  memoryUsage:
    '100 * (1 - node_memory_MemAvailable_bytes{job="node-exporter"} / node_memory_MemTotal_bytes{job="node-exporter"})',
  rootDiskUsage:
    '100 * (1 - node_filesystem_avail_bytes{job="node-exporter",mountpoint="/",fstype!~"tmpfs|fuse.*|overlay"} / node_filesystem_size_bytes{job="node-exporter",mountpoint="/",fstype!~"tmpfs|fuse.*|overlay"})',
  hddUsage:
    '100 * (1 - node_filesystem_avail_bytes{job="node-exporter",mountpoint="/mnt/hdd",fstype!~"tmpfs|fuse.*|overlay"} / node_filesystem_size_bytes{job="node-exporter",mountpoint="/mnt/hdd",fstype!~"tmpfs|fuse.*|overlay"})',
  load1: 'node_load1{job="node-exporter"}',
  uptime: 'time() - node_boot_time_seconds{job="node-exporter"}',
  prometheusUp: 'up{job="prometheus"}',
  nodeExporterUp: 'up{job="node-exporter"}',
  processExporterUp: 'up{job="process-exporter"}',
  firingAlerts: 'count(ALERTS{alertstate="firing"}) or vector(0)',
  jarvisProcessCount:
    'sum(namedprocess_namegroup_num_procs{job="process-exporter",groupname="jarvis-production"}) or vector(0)',
  nextDevProcessCount:
    'sum(namedprocess_namegroup_num_procs{job="process-exporter",groupname="next-dev"}) or vector(0)',
  jarvisCpu:
    '100 * (sum(rate(namedprocess_namegroup_cpu_seconds_total{job="process-exporter",groupname="jarvis-production"}[5m])) or vector(0))',
  pm2Cpu:
    '100 * (sum(rate(namedprocess_namegroup_cpu_seconds_total{job="process-exporter",groupname="pm2-daemon"}[5m])) or vector(0))',
  enp10s0Rx:
    '8 * rate(node_network_receive_bytes_total{job="node-exporter",device="enp10s0"}[5m]) / 1000000',
  enp10s0Tx:
    '8 * rate(node_network_transmit_bytes_total{job="node-exporter",device="enp10s0"}[5m]) / 1000000',
  tailscale0Rx:
    '8 * rate(node_network_receive_bytes_total{job="node-exporter",device="tailscale0"}[5m]) / 1000000',
  tailscale0Tx:
    '8 * rate(node_network_transmit_bytes_total{job="node-exporter",device="tailscale0"}[5m]) / 1000000',
} as const;

const HISTORY_QUERIES = {
  cpu: QUERIES.cpuUsage,
  temperature: QUERIES.cpuTemperature,
  memory: QUERIES.memoryUsage,
  rootDisk: QUERIES.rootDiskUsage,
} as const;

export async function getCpuUsage() {
  return safeQueryNumber(QUERIES.cpuUsage);
}

export async function getCpuTemperature() {
  return safeQueryNumber(QUERIES.cpuTemperature);
}

export async function getMemoryUsage() {
  return safeQueryNumber(QUERIES.memoryUsage);
}

export async function getRootDiskUsage() {
  return safeQueryNumber(QUERIES.rootDiskUsage);
}

export async function getHddUsage() {
  return safeQueryNumber(QUERIES.hddUsage);
}

export async function getNetworkRates() {
  const [enp10s0Rx, enp10s0Tx, tailscale0Rx, tailscale0Tx] = await Promise.all([
    safeQueryNumber(QUERIES.enp10s0Rx),
    safeQueryNumber(QUERIES.enp10s0Tx),
    safeQueryNumber(QUERIES.tailscale0Rx),
    safeQueryNumber(QUERIES.tailscale0Tx),
  ]);

  return {
    enp10s0: { rxMbps: enp10s0Rx, txMbps: enp10s0Tx },
    tailscale0: { rxMbps: tailscale0Rx, txMbps: tailscale0Tx },
  };
}

export async function getSystemLoad() {
  return safeQueryNumber(QUERIES.load1);
}

export async function getServerUptime() {
  return safeQueryNumber(QUERIES.uptime);
}

export async function getMonitoringSummary(): Promise<MonitoringSummary> {
  const [
    cpuUsagePercent,
    cpuTemperatureCelsius,
    memoryUsagePercent,
    rootDiskUsagePercent,
    hddUsagePercent,
    load1,
    uptimeSeconds,
    prometheusUp,
    nodeExporterUp,
    processExporterUp,
    firingAlerts,
    jarvisProcessCount,
    nextDevProcessCount,
    jarvisCpuPercent,
    pm2CpuPercent,
    network,
    cpuHistory,
    temperatureHistory,
    memoryHistory,
    rootDiskHistory,
  ] = await Promise.all([
    getCpuUsage(),
    getCpuTemperature(),
    getMemoryUsage(),
    getRootDiskUsage(),
    getHddUsage(),
    getSystemLoad(),
    getServerUptime(),
    safeQueryNumber(QUERIES.prometheusUp),
    safeQueryNumber(QUERIES.nodeExporterUp),
    safeQueryNumber(QUERIES.processExporterUp),
    safeQueryNumber(QUERIES.firingAlerts),
    safeQueryNumber(QUERIES.jarvisProcessCount),
    safeQueryNumber(QUERIES.nextDevProcessCount),
    safeQueryNumber(QUERIES.jarvisCpu),
    safeQueryNumber(QUERIES.pm2Cpu),
    getNetworkRates(),
    safeQueryHistory(HISTORY_QUERIES.cpu),
    safeQueryHistory(HISTORY_QUERIES.temperature),
    safeQueryHistory(HISTORY_QUERIES.memory),
    safeQueryHistory(HISTORY_QUERIES.rootDisk),
  ]);

  const targets = {
    prometheus: prometheusUp === 1,
    nodeExporter: nodeExporterUp === 1,
    processExporter: processExporterUp === 1,
  };
  const available = Object.values(targets).some(Boolean) || cpuUsagePercent !== null;
  const healthScore = available
    ? calculateHealthScore({
        targets,
        cpuUsagePercent,
        cpuTemperatureCelsius,
        memoryUsagePercent,
        rootDiskUsagePercent,
        hddUsagePercent,
        firingAlerts,
        jarvisProcessCount,
        nextDevProcessCount,
      })
    : null;

  return {
    available,
    generatedAt: new Date().toISOString(),
    status: statusFromScore(healthScore),
    healthScore,
    grafanaUrl: getGrafanaBaseUrl(),
    targets,
    metrics: {
      cpuUsagePercent,
      cpuTemperatureCelsius,
      memoryUsagePercent,
      rootDiskUsagePercent,
      hddUsagePercent,
      load1,
      uptimeSeconds,
      firingAlerts,
    },
    process: {
      jarvisProcessCount,
      nextDevProcessCount,
      jarvisCpuPercent,
      pm2CpuPercent,
    },
    network,
    history: {
      cpu: cpuHistory,
      temperature: temperatureHistory,
      memory: memoryHistory,
      rootDisk: rootDiskHistory,
    },
  };
}

async function safeQueryNumber(query: string) {
  try {
    return await queryNumber(query);
  } catch (error) {
    console.warn("Prometheus query failed", { query, error });
    return null;
  }
}

async function safeQueryHistory(query: string) {
  try {
    return await queryHistory(query);
  } catch (error) {
    console.warn("Prometheus range query failed", { query, error });
    return [];
  }
}

async function queryNumber(query: string) {
  const result = await queryInstant(query);
  return parsePrometheusNumber(result[0]?.value?.[1]);
}

async function queryHistory(query: string): Promise<MonitoringHistoryPoint[]> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - HISTORY_WINDOW_SECONDS;
  const series = await queryRange(query, start, end, HISTORY_STEP_SECONDS);
  const values = series[0]?.values ?? [];

  return values
    .map(([ts, value]) => {
      const parsed = parsePrometheusNumber(value);
      return parsed === null ? null : { ts: Math.round(ts * 1000), value: parsed };
    })
    .filter((point): point is MonitoringHistoryPoint => point !== null);
}

async function queryInstant(query: string) {
  const url = new URL("/api/v1/query", getPrometheusBaseUrl());
  url.searchParams.set("query", query);
  const json = await fetchPrometheus<PrometheusVectorData>(url);
  return json.data.result;
}

async function queryRange(query: string, start: number, end: number, step: number) {
  const url = new URL("/api/v1/query_range", getPrometheusBaseUrl());
  url.searchParams.set("query", query);
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  url.searchParams.set("step", String(step));
  const json = await fetchPrometheus<PrometheusMatrixData>(url);
  return json.data.result;
}

async function fetchPrometheus<T>(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Prometheus request failed with ${response.status}`);
  }

  const json = (await response.json()) as PrometheusResponse<T>;
  if (json.status !== "success") {
    throw new Error(json.error ?? "Prometheus request failed");
  }

  return json;
}

function parsePrometheusNumber(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateHealthScore(args: {
  targets: MonitoringSummary["targets"];
  cpuUsagePercent: number | null;
  cpuTemperatureCelsius: number | null;
  memoryUsagePercent: number | null;
  rootDiskUsagePercent: number | null;
  hddUsagePercent: number | null;
  firingAlerts: number | null;
  jarvisProcessCount: number | null;
  nextDevProcessCount: number | null;
}) {
  let score = 100;

  if (!args.targets.prometheus) score -= 30;
  if (!args.targets.nodeExporter) score -= 35;
  if (!args.targets.processExporter) score -= 10;
  if ((args.firingAlerts ?? 0) > 0) score -= Math.min(30, (args.firingAlerts ?? 0) * 10);
  if ((args.cpuUsagePercent ?? 0) > 95) score -= 20;
  else if ((args.cpuUsagePercent ?? 0) > 80) score -= 12;
  if ((args.cpuTemperatureCelsius ?? 0) > 85) score -= 30;
  else if ((args.cpuTemperatureCelsius ?? 0) > 75) score -= 15;
  if ((args.memoryUsagePercent ?? 0) > 90) score -= 10;
  if ((args.rootDiskUsagePercent ?? 0) > 90) score -= 20;
  else if ((args.rootDiskUsagePercent ?? 0) > 80) score -= 10;
  if ((args.hddUsagePercent ?? 0) > 90) score -= 20;
  else if ((args.hddUsagePercent ?? 0) > 80) score -= 10;
  if ((args.nextDevProcessCount ?? 0) > 0) score -= 20;
  if ((args.jarvisProcessCount ?? 0) < 1) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function statusFromScore(score: number | null): MonitoringStatus {
  if (score === null) return "unknown";
  if (score >= 90) return "healthy";
  if (score >= 70) return "warning";
  return "critical";
}

function getPrometheusBaseUrl() {
  return trimTrailingSlash(process.env.PROMETHEUS_BASE_URL ?? DEFAULT_PROMETHEUS_BASE_URL);
}

function getGrafanaBaseUrl() {
  return trimTrailingSlash(process.env.GRAFANA_BASE_URL ?? DEFAULT_GRAFANA_BASE_URL);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
