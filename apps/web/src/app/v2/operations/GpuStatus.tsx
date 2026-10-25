import type { GpuTelemetry } from "@/lib/operations/gpu";
import styles from "./SystemStatusPanel.module.css";

const num = (n: number | null | undefined, digits = 0) => n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits });
function Bar({ value, label }: { value: number | null; label: string }) {
  return <div className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-valuetext={value === null ? "Unavailable" : `${num(value)} percent`}><span style={{ width: `${value === null ? 0 : Math.min(100, value)}%` }} /></div>;
}
export default function GpuStatus({ telemetry, stale }: { telemetry?: GpuTelemetry; stale: boolean }) {
  return <section className={styles.gpu} aria-label="NVIDIA GPU status">
    <div className={styles.gpuHeading}><div><p className={styles.eyebrow}>Compute / NVIDIA</p><h3>GPU activity</h3></div><span className={styles.gpuSource}>{stale ? "Last known readings" : telemetry?.available ? "Live · nvidia-smi" : telemetry ? "Telemetry unavailable" : "Connecting…"}</span></div>
    {!telemetry ? <p className={styles.gpuNote}>Waiting for GPU readings…</p> : !telemetry.available ? <p className={styles.gpuNote} role="status">GPU telemetry unavailable. The NVIDIA driver may be unavailable or the query timed out.</p> : telemetry.devices.map(gpu => {
      const memoryPercent = gpu.memoryUsedMiB !== null && gpu.memoryTotalMiB !== null && gpu.memoryTotalMiB > 0 ? Math.min(100, gpu.memoryUsedMiB / gpu.memoryTotalMiB * 100) : null;
      const powerPercent = gpu.powerWatts !== null && gpu.powerLimitWatts !== null && gpu.powerLimitWatts > 0 ? Math.min(100, gpu.powerWatts / gpu.powerLimitWatts * 100) : null;
      const label = stale ? "Unconfirmed" : gpu.utilizationPercent === null ? "Activity unknown" : gpu.utilizationPercent > 0 ? "Active" : "Idle";
      return <article key={gpu.index} className={styles.gpuDevice}>
        <header className={styles.gpuDeviceHead}><div><strong>{gpu.name}</strong><span>GPU {gpu.index} · Driver {gpu.driver} · {gpu.performanceState ?? "Performance state unavailable"}</span></div><span className={styles.gpuBadge} data-active={!stale && gpu.utilizationPercent !== null && gpu.utilizationPercent > 0}>{label}</span></header>
        <div className={styles.metrics}>
          <div className={styles.metric}><p>GPU utilization</p><strong>{num(gpu.utilizationPercent)}<small>%</small></strong><Bar value={gpu.utilizationPercent} label={`GPU ${gpu.index} utilization`} /><footer>GPU engine activity</footer></div>
          <div className={styles.metric}><p>VRAM in use</p><strong>{num(gpu.memoryUsedMiB)}<small> MiB</small></strong><Bar value={memoryPercent} label={`GPU ${gpu.index} memory usage`} /><footer>{num(gpu.memoryFreeMiB)} MiB free / {num(gpu.memoryTotalMiB)} MiB total</footer></div>
          <div className={styles.metric}><p>GPU temperature</p><strong>{num(gpu.temperatureCelsius)}<small> °C</small></strong><footer>Fan {num(gpu.fanPercent)}%</footer>{!stale && gpu.temperatureCelsius !== null && gpu.temperatureCelsius >= 85 && <p>Temperature is at least 85°C</p>}</div>
          <div className={styles.metric}><p>GPU power <span>{gpu.powerWatts === null ? "Unavailable" : "Measured"}</span></p><strong>{num(gpu.powerWatts, 1)}<small> W</small></strong><Bar value={powerPercent} label={`GPU ${gpu.index} power relative to limit`} /><footer>{num(gpu.powerLimitWatts)} W configured power limit</footer></div>
        </div>
        <div className={styles.gpuProcesses}>
          {gpu.processes === null ? <p>Compute process list unavailable.</p> : gpu.processes.length === 0 ? <p>No active compute processes reported.</p> : <details open><summary>{gpu.processCount} active compute {gpu.processCount === 1 ? "process" : "processes"}</summary><ul aria-label={`GPU ${gpu.index} compute processes`}>{gpu.processes.map(process => <li key={process.pid}><span>{process.name}<small>PID {process.pid}</small></span><strong>{num(process.memoryMiB)} MiB</strong></li>)}</ul>{gpu.processCount !== null && gpu.processCount > gpu.processes.length && <p>Showing the first {gpu.processes.length} processes.</p>}</details>}
        </div>
      </article>;
    })}
    <p className={styles.gpuNote}>GPU power is the NVIDIA-reported board draw, already part of the UPS load. Compute processes are shown; graphics-only processes are not included.</p>
  </section>;
}
