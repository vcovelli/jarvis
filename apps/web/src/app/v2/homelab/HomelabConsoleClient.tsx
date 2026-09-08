"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MobileSectionNav } from "@/components/MobileSectionNav";

import { useToast } from "@/components/Toast";
import type { HomelabSnapshot, HomelabService } from "@/lib/homelabDocs";
import { useJarvisState, type HomelabActionType } from "@/lib/jarvisStore";
import type { MonitoringHistoryPoint, MonitoringStatus, MonitoringSummary } from "@/lib/prometheus";

type HomelabMobileView = "overview" | "live" | "services";
const POLL_INTERVAL_MS = 45_000;

export function HomelabConsoleClient({ initialSnapshot }: { initialSnapshot: HomelabSnapshot }) {
  const { state, hydrated, demoMode, recordHomelabAction } = useJarvisState();
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState(() => (demoMode ? buildDemoHomelabSnapshot() : initialSnapshot));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshTs, setLastRefreshTs] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(() => (demoMode ? buildDemoMonitoringSummary() : null));
  const [isMonitoringPolling, setIsMonitoringPolling] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<HomelabMobileView>("overview");

  const activeServices = useMemo(
    () => snapshot.services.filter((service) => service.status === "active").length,
    [snapshot.services],
  );
  const healthScore = snapshot.services.length
    ? Math.round((activeServices / snapshot.services.length) * 100)
    : 0;
  const primaryAttention = snapshot.attention[0];
  const recentActions = state.homelabActions.slice(0, 6);
  const inactiveServices = snapshot.services.filter((service) => service.status !== "active");
  const grafanaUrl = demoMode ? "#" : monitoring?.grafanaUrl ?? "http://100.115.58.56:3001";

  const refreshSnapshot = useCallback(
    async (manual = false) => {
      if (manual) {
        setIsRefreshing(true);
      } else {
        setIsPolling(true);
      }
      setRefreshError(null);

      if (demoMode) {
        setSnapshot(buildDemoHomelabSnapshot());
        setLastRefreshTs(Date.now());
        if (manual) {
          recordHomelabAction({
            action: "refresh-snapshot",
            label: "Demo homelab snapshot refresh",
            status: "completed",
            risk: "low",
            note: "Generated showcase snapshot refreshed. Real homelab data is unchanged.",
          });
          showToast("Demo homelab refreshed");
        }
        setIsRefreshing(false);
        setIsPolling(false);
        return;
      }

      try {
        const response = await fetch("/api/homelab/snapshot", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}`);
        }
        const nextSnapshot = (await response.json()) as HomelabSnapshot;
        setSnapshot(nextSnapshot);
        setLastRefreshTs(Date.now());
        if (manual) {
          recordHomelabAction({
            action: "refresh-snapshot",
            label: "Manual homelab snapshot refresh",
            status: "completed",
            risk: "low",
            note: nextSnapshot.generatedAt
              ? `Generated docs timestamp: ${nextSnapshot.generatedAt}`
              : "Snapshot refreshed without a generated timestamp.",
          });
          showToast("Homelab refreshed");
        }
      } catch (error) {
        console.warn("Homelab snapshot refresh failed", error);
        setRefreshError("Snapshot refresh failed. Showing the last known backend state.");
        if (manual) showToast("Homelab refresh failed");
      } finally {
        setIsRefreshing(false);
        setIsPolling(false);
      }
    },
    [demoMode, recordHomelabAction, showToast],
  );

  const refreshMonitoring = useCallback(async () => {
    setIsMonitoringPolling(true);
    setMonitoringError(null);

    if (demoMode) {
      setMonitoring(buildDemoMonitoringSummary());
      setIsMonitoringPolling(false);
      return;
    }

    try {
      const response = await fetch("/api/monitoring/summary", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Monitoring request failed with ${response.status}`);
      }
      const nextSummary = (await response.json()) as MonitoringSummary;
      setMonitoring(nextSummary);
    } catch (error) {
      console.warn("Monitoring summary refresh failed", error);
      setMonitoringError("Prometheus metrics are not available right now.");
    } finally {
      setIsMonitoringPolling(false);
    }
  }, [demoMode]);

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([refreshSnapshot(true), refreshMonitoring()]);
  }, [refreshMonitoring, refreshSnapshot]);

  useEffect(() => {
    setLastRefreshTs(Date.now());
    if (demoMode) {
      setSnapshot(buildDemoHomelabSnapshot());
      setMonitoring(buildDemoMonitoringSummary());
      setRefreshError(null);
      setMonitoringError(null);
      return;
    }
    void refreshMonitoring();
  }, [demoMode, refreshMonitoring]);

  useEffect(() => {
    if (demoMode) return;
    const interval = window.setInterval(() => {
      void refreshSnapshot(false);
      void refreshMonitoring();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [demoMode, refreshMonitoring, refreshSnapshot]);

  function recordConfirmedAction(args: {
    action: HomelabActionType;
    label: string;
    target?: string;
    risk: "low" | "guarded";
    status?: "recorded" | "completed" | "blocked";
    note?: string;
    confirmation: string;
  }) {
    if (!window.confirm(args.confirmation)) return;
    recordHomelabAction({
      action: args.action,
      label: args.label,
      target: args.target,
      status: args.status ?? "recorded",
      risk: args.risk,
      note: args.note,
    });
    showToast("Action recorded");
  }

  function handleHealthCheck(service: HomelabService) {
    recordConfirmedAction({
      action: "service-health-check",
      label: `Health check requested for ${service.name}`,
      target: service.unit,
      risk: "low",
      note: `Current status: ${service.status}`,
      confirmation: `Record a health-check audit entry for ${service.name}? No command will run.`,
    });
  }

  function handleRestartReview(service: HomelabService) {
    recordConfirmedAction({
      action: "service-restart-review",
      label: `Restart review queued for ${service.name}`,
      target: service.unit,
      risk: "guarded",
      status: "blocked",
      note: "Command execution is not configured. This records intent for a guarded future action.",
      confirmation: `Queue a guarded restart review for ${service.name}? No service command will run.`,
    });
  }

  function handleDocsReview() {
    recordConfirmedAction({
      action: "docs-review",
      label: "Homelab documentation review queued",
      target: snapshot.docs.latestSnapshot ?? snapshot.docsRoot,
      risk: "low",
      note: primaryAttention?.title,
      confirmation: "Record a documentation review in the homelab audit log?",
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-8">
      <header className="mobile-compact-header flex flex-wrap items-end justify-between gap-3 lg:gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Homelab</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">covelli-server</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Backend snapshot from generated docs, refreshed every {POLL_INTERVAL_MS / 1000}s.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/v2/documentation?doc=monitoring/health.md"
            className="hidden min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/80 hover:border-cyan-300/40 sm:inline-flex"
          >
            Health docs
          </Link>
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/80 hover:border-cyan-300/40 sm:inline-flex"
          >
            Grafana
          </a>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing}
            className="min-h-9 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>
      <MobileSectionNav
        label="Homelab sections"
        value={mobileView}
        onChange={setMobileView}
        options={[
          { value: "overview", label: "Overview" },
          { value: "live", label: "Live metrics" },
          { value: "services", label: "Services", badge: inactiveServices.length || undefined },
        ]}
      />

      <section className={(mobileView === "overview" ? "grid " : "hidden lg:grid ") + "gap-4 lg:grid-cols-[1.25fr_0.75fr] lg:gap-6"}>
        <div className="glass-panel mobile-card-padding rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">System state</p>
              <h2 data-guide="homelab-overview" className="mt-3 text-2xl font-semibold text-white">{healthScore}% operational</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/70">
              {isPolling ? "Polling" : lastRefreshTs ? `Updated ${formatTime(lastRefreshTs)}` : "Snapshot loaded"}
            </span>
          </div>
          {refreshError && (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              {refreshError}
            </div>
          )}
          <div className="mt-6 hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Hostname" value={snapshot.system.hostname} />
            <Metric label="Operating system" value={snapshot.system.os} />
            <Metric label="Kernel" value={snapshot.system.kernel} />
            <Metric label="Uptime" value={snapshot.system.uptime} />
            <Metric label="LAN" value={snapshot.network.lanIp} />
            <Metric label="Tailscale" value={snapshot.network.tailscaleIp} />
          </div>
        </div>

        <div className={`mobile-card-padding rounded-3xl border p-6 ${attentionTone(primaryAttention?.severity)}`}>
          <p className="text-xs uppercase tracking-[0.3em] opacity-80">Recommended action</p>
          <h2 className="mt-4 text-xl font-semibold text-white">
            {primaryAttention?.title ?? "No active attention item"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-200">
            {primaryAttention?.detail ?? "Generated docs do not show an active issue."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {primaryAttention?.href && (
              <Link
                href={primaryAttention.href}
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/80"
              >
                Open
              </Link>
            )}
            <button
              type="button"
              onClick={handleDocsReview}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/80"
            >
              Log review
            </button>
          </div>
        </div>
      </section>

      <div className={mobileView === "live" ? "" : "hidden lg:block"}>
      <MonitoringSection
        grafanaUrl={grafanaUrl}
        isPolling={isMonitoringPolling}
        error={monitoringError}
        summary={monitoring}
      />
      </div>

      <section className={(mobileView === "services" ? "grid " : "hidden lg:grid ") + "grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6"}>
        <MetricPanel label="Services" value={`${activeServices}/${snapshot.services.length}`} detail="Expected services active" tone="text-emerald-200" />
        <MetricPanel label="Storage" value={snapshot.system.rootFilesystem} detail="Root filesystem" tone="text-cyan-200" />
        <MetricPanel label="Docs" value={String(snapshot.docs.total)} detail={`Latest: ${snapshot.docs.latestSnapshot ?? "none"}`} tone="text-white" />
        <MetricPanel
          label="Snapshot"
          value={lastRefreshTs ? formatSnapshotAge(snapshot.generatedAt) : "Recorded"}
          detail={snapshot.generatedAt ?? "No timestamp"}
          tone="text-amber-200"
        />
      </section>

      <section className={(mobileView === "services" ? "grid " : "hidden lg:grid ") + "gap-4 lg:grid-cols-[1.35fr_0.65fr] lg:gap-6"}>
        <div className="glass-panel overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Service health</p>
              <h2 data-guide="homelab-services" className="mt-2 text-xl font-semibold text-white">Managed services</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${inactiveServices.length ? "bg-rose-300/15 text-rose-100" : "bg-emerald-300/15 text-emerald-100"}`}>
              {inactiveServices.length ? `${inactiveServices.length} need attention` : "Nominal"}
            </span>
          </div>
          <div className="divide-y divide-white/10">
            {snapshot.services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                onHealthCheck={() => handleHealthCheck(service)}
                onRestartReview={() => handleRestartReview(service)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Safe actions</p>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => void handleManualRefresh()}
                className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-left text-sm font-semibold text-cyan-100 hover:border-cyan-200/70"
              >
                Refresh backend snapshot
              </button>
              <button
                type="button"
                onClick={handleDocsReview}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white hover:border-cyan-300/40"
              >
                Record docs review
              </button>
              <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Guarded service commands are audit-only until an explicit command runner is wired in.
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Action audit</p>
            <div className="mt-5 space-y-3">
              {!hydrated ? (
                <p className="text-sm text-zinc-400">Loading audit log...</p>
              ) : recentActions.length ? (
                recentActions.map((action) => <ActionRow key={action.id} action={action} />)
              ) : (
                <p className="text-sm text-zinc-400">No homelab actions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


function buildDemoHomelabSnapshot(): HomelabSnapshot {
  const now = new Date().toISOString();
  return {
    docsRoot: "/demo/homelab-docs",
    generatedAt: now,
    system: {
      hostname: "jarvis-demo-node",
      os: "Ubuntu LTS demo image",
      kernel: "6.8.0-demo",
      uptime: "18 days, 4 hours",
      rootFilesystem: "32% used",
      memory: "41% used",
    },
    network: {
      lanIp: "10.0.0.42",
      tailscaleIp: "100.64.0.42",
      gateway: "10.0.0.1",
      primaryInterface: "demo0",
      tailscaleHealth: [],
    },
    services: [
      buildDemoService("jarvis", "Jarvis App", "Personal command center", "jarvis.service", ["3000"], now),
      buildDemoService("postgres", "Postgres", "Application database", "postgresql.service", ["5432"], now),
      buildDemoService("prometheus", "Prometheus", "Metrics collection", "prometheus.service", ["9090"], now),
      buildDemoService("grafana", "Grafana", "Operations dashboards", "grafana-server.service", ["3001"], now),
    ],
    attention: [
      {
        id: "demo-ready",
        title: "Demo stack ready",
        detail: "All generated services are healthy and safe to present.",
        severity: "info",
      },
    ],
    docs: {
      total: 18,
      snapshots: 6,
      latestSnapshot: "demo-snapshot.md",
    },
  };
}

function buildDemoService(
  id: string,
  name: string,
  purpose: string,
  unit: string,
  ports: string[],
  lastChecked: string,
): HomelabService {
  return {
    id,
    name,
    purpose,
    unit,
    status: "active",
    ports,
    localUrl: "http://10.0.0.42",
    tailscaleUrl: "http://100.64.0.42",
    docId: `${id}-demo-doc`,
    lastChecked,
  };
}

function buildDemoMonitoringSummary(): MonitoringSummary {
  const now = Date.now();
  const history = Array.from({ length: 16 }, (_, index) => ({
    ts: now - (15 - index) * 60_000,
    value: 28 + Math.sin(index / 2) * 8 + index * 0.6,
  }));
  return {
    available: true,
    generatedAt: new Date(now).toISOString(),
    status: "healthy",
    healthScore: 97,
    grafanaUrl: "#",
    targets: {
      prometheus: true,
      nodeExporter: true,
      processExporter: true,
    },
    metrics: {
      cpuUsagePercent: 34,
      cpuTemperatureCelsius: 51,
      memoryUsagePercent: 41,
      rootDiskUsagePercent: 32,
      hddUsagePercent: 58,
      load1: 0.82,
      uptimeSeconds: 1_568_000,
      firingAlerts: 0,
    },
    process: {
      jarvisProcessCount: 2,
      nextDevProcessCount: 0,
      jarvisCpuPercent: 4.2,
      pm2CpuPercent: 0.6,
    },
    network: {
      enp10s0: { rxMbps: 18.4, txMbps: 6.2 },
      tailscale0: { rxMbps: 4.1, txMbps: 1.8 },
    },
    history: {
      cpu: history,
      temperature: history.map((point) => ({ ...point, value: point.value + 16 })),
      memory: history.map((point) => ({ ...point, value: point.value + 10 })),
      rootDisk: history.map((point) => ({ ...point, value: 32 })),
    },
  };
}

function MonitoringSection({
  summary,
  error,
  isPolling,
  grafanaUrl,
}: {
  summary: MonitoringSummary | null;
  error: string | null;
  isPolling: boolean;
  grafanaUrl: string;
}) {
  const status = summary?.status ?? "unknown";
  const metrics = summary?.metrics;
  const process = summary?.process;
  const network = summary?.network;

  return (
    <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className={`rounded-3xl border p-6 ${monitoringTone(status)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] opacity-80">Realtime monitoring</p>
            <h2 className="mt-4 text-3xl font-semibold text-white">
              {summary?.healthScore ?? "--"} / 100
            </h2>
          </div>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
            {isPolling ? "Polling" : status}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-200">
          {error ?? (summary?.available ? "Prometheus live data is connected." : "Waiting for Prometheus metrics.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <TargetPill label="Prometheus" active={summary?.targets.prometheus} />
          <TargetPill label="node_exporter" active={summary?.targets.nodeExporter} />
          <TargetPill label="process" active={summary?.targets.processExporter} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/80 hover:border-cyan-300/50"
          >
            Open Grafana
          </a>
          <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/55">
            {summary ? formatTime(new Date(summary.generatedAt).valueOf()) : "Pending"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LiveMetric
          label="CPU"
          value={formatPercent(metrics?.cpuUsagePercent)}
          detail="5m average"
          tone={metricTone(metrics?.cpuUsagePercent, 80, 95)}
          history={summary?.history.cpu}
        />
        <LiveMetric
          label="Temperature"
          value={formatCelsius(metrics?.cpuTemperatureCelsius)}
          detail="Ryzen Tctl"
          tone={metricTone(metrics?.cpuTemperatureCelsius, 75, 85)}
          history={summary?.history.temperature}
        />
        <LiveMetric
          label="Memory"
          value={formatPercent(metrics?.memoryUsagePercent)}
          detail="MemAvailable based"
          tone={metricTone(metrics?.memoryUsagePercent, 85, 95)}
          history={summary?.history.memory}
        />
        <LiveMetric
          label="Root disk"
          value={formatPercent(metrics?.rootDiskUsagePercent)}
          detail="/ filesystem"
          tone={metricTone(metrics?.rootDiskUsagePercent, 80, 90)}
          history={summary?.history.rootDisk}
        />
        <LiveMetric
          label="External HDD"
          value={formatPercent(metrics?.hddUsagePercent)}
          detail="/mnt/hdd"
          tone={metricTone(metrics?.hddUsagePercent, 80, 90)}
        />
        <LiveMetric
          label="Load"
          value={formatNumber(metrics?.load1, 2)}
          detail={`Uptime ${formatUptime(metrics?.uptimeSeconds)}`}
          tone="text-cyan-100"
        />
        <LiveMetric
          label="Jarvis CPU"
          value={formatPercent(process?.jarvisCpuPercent)}
          detail={`${formatCount(process?.jarvisProcessCount)} production procs`}
          tone={metricTone(process?.jarvisCpuPercent, 80, 120)}
        />
        <LiveMetric
          label="Next dev"
          value={formatCount(process?.nextDevProcessCount)}
          detail={(process?.nextDevProcessCount ?? 0) > 0 ? "unexpected" : "none running"}
          tone={(process?.nextDevProcessCount ?? 0) > 0 ? "text-rose-100" : "text-emerald-100"}
        />
        <LiveMetric
          label="enp10s0 RX"
          value={formatMbps(network?.enp10s0.rxMbps)}
          detail={`TX ${formatMbps(network?.enp10s0.txMbps)}`}
          tone="text-cyan-100"
        />
        <LiveMetric
          label="tailscale0 RX"
          value={formatMbps(network?.tailscale0.rxMbps)}
          detail={`TX ${formatMbps(network?.tailscale0.txMbps)}`}
          tone="text-cyan-100"
        />
        <LiveMetric
          label="Alerts"
          value={formatCount(metrics?.firingAlerts)}
          detail="currently firing"
          tone={(metrics?.firingAlerts ?? 0) > 0 ? "text-rose-100" : "text-emerald-100"}
        />
      </div>
    </section>
  );
}

function LiveMetric({
  label,
  value,
  detail,
  tone,
  history,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  history?: MonitoringHistoryPoint[];
}) {
  return (
    <div className="glass-panel min-h-[150px] rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg">
      <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className={`mt-3 break-words text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 min-h-5 text-xs text-zinc-400">{detail}</p>
      {history && <Sparkline points={history} />}
    </div>
  );
}

function Sparkline({ points }: { points: MonitoringHistoryPoint[] }) {
  if (points.length < 2) {
    return <div className="mt-4 h-9 rounded-2xl border border-white/10 bg-black/20" />;
  }

  const width = 140;
  const height = 36;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const lastIndex = Math.max(1, points.length - 1);
  const polyline = points
    .map((point, index) => {
      const x = (index / lastIndex) * width;
      const y = height - ((point.value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="mt-4 h-9 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Last hour trend">
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-cyan-200" />
    </svg>
  );
}

function TargetPill({ label, active }: { label: string; active?: boolean }) {
  const classes = active
    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
    : active === false
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : "border-white/10 bg-black/20 text-white/55";

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${classes}`}>
      {label}
    </span>
  );
}

function ServiceRow({
  service,
  onHealthCheck,
  onRestartReview,
}: {
  service: HomelabService;
  onHealthCheck: () => void;
  onRestartReview: () => void;
}) {
  return (
    <article className="grid gap-4 px-6 py-5 xl:grid-cols-[1fr_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-white">{service.name}</h3>
          <StatusPill status={service.status} />
        </div>
        <p className="mt-1 text-sm leading-6 text-zinc-300">{service.purpose}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          <span>{service.unit}</span>
          <span>{service.ports.length ? `Ports ${service.ports.join(", ")}` : "No exposed ports"}</span>
        </div>
        {service.command && (
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-cyan-100">
            <code>{service.command}</code>
          </pre>
        )}
      </div>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        {service.localUrl && <ServiceLink href={service.localUrl} label="Local" />}
        {service.tailscaleUrl && <ServiceLink href={service.tailscaleUrl} label="Tailscale" />}
        <Link
          href={`/v2/documentation?doc=${encodeURIComponent(service.docId)}`}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:border-cyan-300/40"
        >
          Docs
        </Link>
        <button
          type="button"
          onClick={onHealthCheck}
          className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-200/60"
        >
          Check
        </button>
        {service.status !== "active" && (
          <button
            type="button"
            onClick={onRestartReview}
            className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-200/70"
          >
            Restart review
          </button>
        )}
      </div>
    </article>
  );
}

function ServiceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:border-cyan-300/40"
    >
      {label}
    </a>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
        active ? "bg-emerald-300/15 text-emerald-100" : "bg-rose-300/15 text-rose-100"
      }`}
    >
      {status}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-400">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{label}</p>
      <p className={`mt-4 break-words text-3xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{detail}</p>
    </div>
  );
}

function ActionRow({ action }: { action: { ts: number; label: string; target?: string; status: string; risk: string; note?: string } }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{action.label}</p>
        <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${action.risk === "guarded" ? "bg-amber-300/15 text-amber-100" : "bg-cyan-300/15 text-cyan-100"}`}>
          {action.status}
        </span>
      </div>
      <p className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-500">
        {formatTime(action.ts)}{action.target ? ` - ${action.target}` : ""}
      </p>
      {action.note && <p className="mt-2 text-sm leading-6 text-zinc-300">{action.note}</p>}
    </div>
  );
}


function monitoringTone(status: MonitoringStatus) {
  switch (status) {
    case "healthy":
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "critical":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-zinc-200";
  }
}

function metricTone(value: number | null | undefined, warning: number, critical: number) {
  if (value === null || value === undefined) return "text-white";
  if (value >= critical) return "text-rose-100";
  if (value >= warning) return "text-amber-100";
  return "text-emerald-100";
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : `${Math.round(value)}%`;
}

function formatCelsius(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : `${Math.round(value)}C`;
}

function formatMbps(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  if (value < 1) return `${value.toFixed(2)} Mb/s`;
  return `${value.toFixed(1)} Mb/s`;
}

function formatNumber(value: number | null | undefined, decimals = 0) {
  return value === null || value === undefined ? "--" : value.toFixed(decimals);
}

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : String(Math.round(value));
}

function formatUptime(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((value % 3_600) / 60);
  return `${hours}h ${minutes}m`;
}

function attentionTone(severity?: string) {
  switch (severity) {
    case "critical":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  }
}

function formatSnapshotAge(value: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value.replace(" UTC", "Z"));
  if (Number.isNaN(parsed.valueOf())) return "Recorded";
  const minutes = Math.max(0, Math.round((Date.now() - parsed.valueOf()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
