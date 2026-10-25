"use client";

import { useEffect, useRef, useState } from "react";
import type { SystemTelemetry } from "@/lib/operations/systemTelemetry";
import styles from "./SystemStatusPanel.module.css";
import GpuStatus from "./GpuStatus";

type Point = { ts: number; value: number };
const num = (n: number | null | undefined, digits = 0) => n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits });
const duration = (seconds: number | null | undefined) => seconds == null ? "—" : seconds >= 86400 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h` : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}m`;
function Icon({ kind }: { kind: "power" | "battery" | "server" | "refresh" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "power" ? <path d="m13 2-9 12h7l-1 8 10-12h-7z" /> : kind === "battery" ? <><rect x="3" y="6" width="16" height="12" rx="3" /><path d="M22 10v4M7 10v4m4-4v4m4-4v4" /></> : kind === "server" ? <><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6h.01M7 17h.01M12 6h5m-5 11h5" /></> : <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" /></>}
  </svg>;
}
function Meter({ value, label, danger = false }: { value: number | null | undefined; label: string; danger?: boolean }) {
  return <div className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.min(100, value)} aria-valuetext={value == null ? "Unavailable" : `${num(value)} percent`}><span className={danger ? styles.dangerFill : ""} style={{ width: `${value == null ? 0 : Math.min(100, value)}%` }} /></div>;
}
function Chart({ points, label, unit }: { points: Point[]; label: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className={styles.chartEmpty}>Collecting readings… the trend appears after the next refresh.</div>;
  const min = Math.min(...points.map(p => p.value));
  const max = Math.max(...points.map(p => p.value));
  const floor = Math.max(0, min - Math.max(2, (max - min) * .25));
  const ceil = max + Math.max(2, (max - min) * .25);
  const first = points[0].ts;
  const span = points.at(-1)!.ts - first || 1;
  const xy = (p: Point) => `${((p.ts - first) / span * 600).toFixed(1)},${(100 - (p.value - floor) / (ceil - floor) * 85).toFixed(1)}`;
  const path = points.map((p, i) => `${i === 0 || p.ts - points[i - 1].ts > 180000 ? "M" : "L"}${xy(p)}`).join(" ");
  const selected = points[hover ?? points.length - 1];
  return <div className={styles.chart}>
    <div className={styles.chartReadout}><span>{label}</span><strong>{num(selected.value, 1)} {unit} <small>at {new Date(selected.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></strong></div>
    <svg viewBox="0 0 600 115" preserveAspectRatio="none" role="img" aria-label={`${label}, minimum ${num(min, 1)}, maximum ${num(max, 1)} ${unit}`} onMouseLeave={() => setHover(null)} onMouseMove={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ts = first + (event.clientX - rect.left) / rect.width * span;
      setHover(points.reduce((best, p, i) => Math.abs(p.ts - ts) < Math.abs(points[best].ts - ts) ? i : best, 0));
    }}>
      {[15, 55, 95].map(y => <path key={y} d={`M0 ${y}H600`} className={styles.gridLine} />)}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {hover !== null && <circle cx={xy(selected).split(",")[0]} cy={xy(selected).split(",")[1]} r="4" fill="currentColor" />}
    </svg>
    <div className={styles.chartAxis}><span>{new Date(first).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span>Range {num(min, 1)}–{num(max, 1)} {unit}</span><span>{new Date(points.at(-1)!.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
  </div>;
}

export default function SystemStatusPanel() {
  const [view, setView] = useState("overview");
  const [data, setData] = useState<SystemTelemetry | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<Point[]>([]);
  const [trend, setTrend] = useState<"power" | "cpu" | "temperature">("power");
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let controller: AbortController | null = null;
    async function load() {
      if (controller || document.hidden) return;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      setBusy(true);
      try {
        const response = await fetch("/api/operations/system", { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (alive && [401, 403].includes(response.status)) { setData(null); setHistory([]); }
          throw new Error([401, 403].includes(response.status) ? "Sign in with an administrator account to view system status." : "Live readings could not be refreshed.");
        }
        const next: SystemTelemetry = await response.json();
        if (!alive) return;
        setData(next); setError(""); setNow(Date.now());
        if (next.power.available && next.power.watts !== null) setHistory(old => {
          const point = { ts: Date.parse(next.generatedAt), value: next.power.watts! };
          return old.at(-1)?.ts === point.ts ? old : [...old, point].filter(p => p.ts > point.ts - 15 * 60000).slice(-61);
        });
      } catch (e) { if (alive) setError(e instanceof Error && e.name !== "AbortError" ? e.message : "Live telemetry timed out. Retrying automatically."); }
      finally { clearTimeout(timeout); controller = null; if (alive) setBusy(false); }
    }
    refreshRef.current = () => { void load(); };
    void load();
    const poll = setInterval(() => { void load(); }, 15000);
    const tick = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 5000);
    const visible = () => { if (!document.hidden) { setNow(Date.now()); void load(); } };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => { alive = false; controller?.abort(); clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, []);
  const power = data?.power;
  const m = data?.monitoring.metrics;
  const age = data ? Math.max(0, Math.floor((now - Date.parse(data.generatedAt)) / 1000)) : null;
  const stale = age !== null && age > 45;
  const tone = stale || error ? "unknown" : power?.state ?? "unknown";
  const monitor = data?.services.find(s => s.name === "UPS shutdown monitor");
  const points = trend === "power" ? history : data?.monitoring.history[trend] ?? [];
  const alerts = [ ...(power?.alerts ?? []), ...(monitor && monitor.state !== "active" ? ["UPS shutdown monitor is not confirmed running."] : []), ...(data && !data.monitoring.targets.nodeExporter ? ["System metrics are unavailable or the host exporter is down."] : []) ];
  return <section className={styles.panel} data-tone={tone} aria-labelledby="server-status-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Infrastructure / Live telemetry</p><h2 id="server-status-title">{data?.host ?? "covelli-server"}<span className={styles.subtitle}>System & power</span></h2></div>
      <div className={styles.liveTools}><span className={styles.freshness} aria-live="polite"><i />{error ? "Connection interrupted" : stale ? "Readings are stale" : data ? `Updated ${age ?? 0}s ago` : "Connecting…"}</span><button className={styles.refresh} aria-label="Refresh server status" disabled={busy} onClick={() => refreshRef.current()}><Icon kind="refresh" /></button></div>
    </header>
    {error && <p className={styles.notice} role="alert">{error} {data ? "Showing the last received readings." : "No current readings are available."}</p>}
    {stale && !error && <p className={styles.notice} role="status">These readings are over 45 seconds old. Current power protection is unknown.</p>}
    <div className={styles.viewBar}><label>System view<select aria-label="System view" value={view} onChange={e => setView(e.target.value)}><option value="overview">At a glance</option><option value="power">Power & battery</option><option value="compute">CPU, memory & GPU</option><option value="continuity">Services & backups</option><option value="all">All readings</option></select></label><span>Read-only · refreshes every 15 seconds</span></div>
    {view === "overview" && <div className={styles.summaryStrip}><div><span className={styles.statusPill}>{stale || error ? "Live status unavailable" : power?.label ?? "Connecting"}</span><h3>{tone === "online" ? "Power steady. Battery ready." : tone === "battery" ? "Running on battery." : "Check your power protection."}</h3></div><div><strong>{num(power?.chargePercent)}%</strong><span>Battery charge</span></div><div><strong>{duration(power?.runtimeSeconds)}</strong><span>Estimated reserve</span></div></div>}
    {["power", "all"].includes(view) && <div className={styles.hero}>
      <div className={styles.powerStory}>
        <span className={styles.statusPill}><i />{stale || error ? "Live status unavailable" : power?.label ?? "Checking power status"}</span>
        <h3>{tone === "online" ? "Power steady. Battery ready." : tone === "battery" ? "Your battery is carrying the load." : tone === "critical" ? "Power needs immediate attention." : tone === "warning" ? "Check your power protection." : "Waiting for a clear power picture."}</h3>
        <p>{tone === "online" ? "Utility power is supplying the UPS. Battery reserve is available if the mains drops." : tone === "battery" ? "Runtime changes with connected load. Watch the remaining reserve and shutdown monitor." : "Use the readings and checks below to understand what needs attention."}</p>
        <div className={styles.flow} aria-label={`Power path: utility ${power?.flags.includes("OL") ? "online" : "not confirmed"}, UPS, connected equipment`}>
          <div><Icon kind="power" /><span>Utility</span><small>{num(power?.inputVolts, 1)} V</small></div>
          <span className={styles.flowLine} />
          <div><Icon kind="battery" /><span>UPS battery</span><small>{num(power?.chargePercent)}%</small></div>
          <span className={styles.flowLine} />
          <div><Icon kind="server" /><span>Equipment</span><small>{num(power?.loadPercent)}% load</small></div>
        </div>
      </div>
      <div className={styles.reserve}>
        <div className={styles.batteryVisual} aria-hidden="true"><div style={{ height: `${power?.chargePercent ?? 0}%` }} /><span>{num(power?.chargePercent)}<small>%</small></span></div>
        <div><p className={styles.eyebrow}>Battery reserve</p><div className={styles.runtime}>{duration(power?.runtimeSeconds)}</div><p>estimated runtime at current load</p><span className={styles.monitorBadge}>{monitor?.state === "active" ? "● Shutdown monitor running" : "○ Shutdown monitor unconfirmed"}</span></div>
      </div>
    </div>
    }
    {alerts.length > 0 && <div className={styles.alerts} role="status">{alerts.map(alert => <p key={alert}>{alert}</p>)}</div>}
    {["overview", "compute", "power", "all"].includes(view) && <div className={styles.metrics}>
      <article className={styles.metric}><p>UPS output <span>{power?.wattsSource === "estimated" ? "Estimated" : power?.wattsSource === "measured" ? "Measured" : "Unavailable"}</span></p><strong>{num(power?.watts)}<small> W</small></strong><Meter value={power?.loadPercent} label="UPS load" danger={(power?.loadPercent ?? 0) >= 80} /><footer>{power?.wattsSource === "estimated" ? `${num(power.loadPercent)}% load × ${num(power.nominalWatts)} W rating` : "All UPS-connected equipment"}</footer></article>
      <article className={styles.metric}><p>CPU utilization</p><strong>{num(m?.cpuUsagePercent, 1)}<small>%</small></strong><Meter value={m?.cpuUsagePercent} label="CPU utilization" danger={(m?.cpuUsagePercent ?? 0) >= 85} /><footer>{num(m?.cpuTemperatureCelsius, 1)} °C processor temperature</footer></article>
      <article className={styles.metric}><p>Memory in use</p><strong>{num(m?.memoryUsagePercent, 1)}<small>%</small></strong><Meter value={m?.memoryUsagePercent} label="Memory in use" danger={(m?.memoryUsagePercent ?? 0) >= 90} /><footer>Available memory excluded</footer></article>
      <article className={styles.metric}><p>System disk</p><strong>{num(m?.rootDiskUsagePercent, 1)}<small>%</small></strong><Meter value={m?.rootDiskUsagePercent} label="System disk usage" danger={(m?.rootDiskUsagePercent ?? 0) >= 80} /><footer>USB storage: {num(m?.hddUsagePercent, 1)}% used</footer></article>
    </div>
    }
    {["compute", "all"].includes(view) && <GpuStatus telemetry={data?.gpu} stale={stale || Boolean(error)} />}
    {view === "overview" && <div className={styles.gpuGlance}><span>GPU compute</span>{data?.gpu.available && data.gpu.devices.length ? data.gpu.devices.map(gpu => <div key={gpu.index}><strong>{gpu.name}</strong><span>{stale || error ? "Readings unconfirmed" : `${num(gpu.utilizationPercent)}% utilization · ${num(gpu.memoryUsedMiB)} / ${num(gpu.memoryTotalMiB)} MiB VRAM · ${num(gpu.powerWatts)} W board power`}</span></div>) : <span>Telemetry unavailable</span>}</div>}
    {view === "overview" && <details className={styles.details}><summary>GPU & active compute processes<span>NVIDIA telemetry</span></summary><GpuStatus telemetry={data?.gpu} stale={stale || Boolean(error)} /></details>}
    <div className={`${styles.lower} ${view !== "all" ? styles.single : ""}`}>
      {["overview", "power", "compute", "all"].includes(view) && <section className={styles.trends} aria-label="Telemetry trends"><div className={styles.sectionHead}><h3>At a glance, over time</h3><div className={styles.tabs} aria-label="Choose trend">{([ ["power", "Power"], ["cpu", "CPU"], ["temperature", "Temperature"] ] as const).map(([key, label]) => <button key={key} aria-pressed={trend === key} onClick={() => setTrend(key)}>{label}</button>)}</div></div><Chart points={points} label={trend === "power" ? `UPS output · ${power?.wattsSource ?? "unavailable"}` : trend === "cpu" ? "CPU utilization" : "CPU temperature"} unit={trend === "power" ? "W" : trend === "cpu" ? "%" : "°C"} /><p className={styles.chartFoot}>{trend === "power" ? "Readings since opening this panel · up to 15 minutes" : "Last hour · host monitoring"}</p></section>}
      {["continuity", "all"].includes(view) && <section className={styles.checks} aria-label="Service and backup checks"><h3>Protection & continuity</h3><div className={styles.checkRow}><span>Server uptime</span><strong>{duration(m?.uptimeSeconds)}</strong></div>{data?.services.map(service => <div className={styles.checkRow} key={service.name}><span>{service.name}</span><strong data-ok={service.state === "active"}>{service.state === "active" ? "Running" : service.state === "unknown" ? "Unknown" : "Check service"}</strong></div>)}{data?.backups.map(backup => <div className={styles.checkRow} key={backup.name}><span>{backup.name}<small>{backup.completedAt ? new Date(backup.completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No completion time reported"}</small></span><strong data-ok={backup.state === "success"}>{({ success: "Job passed", failed: "Failed", running: "Running", stale: "Overdue", unknown: "Unverified" })[backup.state]}</strong></div>)}</section>}
    </div>
    {["power", "all"].includes(view) && <details className={styles.details}><summary>UPS details & what these readings mean<span>Read-only monitoring</span></summary><div className={styles.detailBody}><dl><div><dt>UPS model</dt><dd>{power?.model ?? "Unavailable"}</dd></div><div><dt>Battery voltage</dt><dd>{num(power?.batteryVolts, 1)} V</dd></div><div><dt>Low-battery thresholds</dt><dd>{num(power?.lowChargePercent)}% / {duration(power?.lowRuntimeSeconds)} runtime</dd></div><div><dt>Last UPS self-test</dt><dd>{power?.selfTest ?? "Not reported"}</dd></div><div><dt>UPS status flags</dt><dd>{power?.flags.join(" · ") || "Unavailable"}</dd></div></dl><p>Power covers everything connected to the UPS, not just this server. Estimated watts use load percentage × rated watts; wall consumption and UPS losses are not measured. Runtime is a UPS estimate, not a guarantee.</p><p>A running shutdown monitor does not prove outlet wiring or a successful outage shutdown test. Backup job success does not prove a restore. This panel observes only; it cannot switch power, start a battery test, or shut down equipment.</p></div></details>}
  </section>;
}
