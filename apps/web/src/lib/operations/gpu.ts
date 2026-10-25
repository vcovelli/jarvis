export const GPU_QUERY = "index,name,uuid,driver_version,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,power.limit,pstate,fan.speed";
export const GPU_PROCESS_QUERY = "gpu_uuid,pid,process_name,used_gpu_memory";

export type GpuProcess = { pid: number; name: string; memoryMiB: number | null };
export type GpuReading = {
  index: number; name: string; driver: string; utilizationPercent: number | null;
  memoryTotalMiB: number | null; memoryUsedMiB: number | null; memoryFreeMiB: number | null;
  temperatureCelsius: number | null; powerWatts: number | null; powerLimitWatts: number | null;
  performanceState: string | null; fanPercent: number | null;
  processes: GpuProcess[] | null; processCount: number | null;
};
export type GpuTelemetry = { available: boolean; devices: GpuReading[] };

// nvidia-smi CSV can quote names containing commas. Do not parse process paths
// or driver error messages into browser-visible fields.
function csv(line: string): string[] {
  const fields: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { fields.push(value.trim()); value = ""; }
    else value += c;
  }
  return quoted ? [] : [...fields, value.trim()];
}
function number(value: string, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n <= max ? n : null;
}
const label = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 100);

export function parseGpu(raw: string | null, processRaw: string | null): GpuTelemetry {
  const devices: GpuReading[] = [];
  const processRows = processRaw === null ? null : processRaw.split(/\r?\n/).filter(s => s.trim()).map(csv);
  const validProcesses = processRows?.every(r => r.length === 4 && r[0].startsWith("GPU-") && /^\d+$/.test(r[1]));
  for (const line of (raw ?? "").split(/\r?\n/).filter(s => s.trim())) {
    const r = csv(line);
    if (r.length !== 13 || !/^\d+$/.test(r[0]) || !r[1] || !r[2].startsWith("GPU-")) continue;
    const processes = validProcesses ? processRows!.filter(p => p[0] === r[2]).map(p => ({ pid: Number(p[1]), name: label(p[2].split(/[\\/]/).at(-1) || "Unknown process"), memoryMiB: number(p[3]) })) : null;
    devices.push({
      index: Number(r[0]), name: label(r[1]), driver: label(r[3]),
      memoryTotalMiB: number(r[4]), memoryUsedMiB: number(r[5]), memoryFreeMiB: number(r[6]),
      utilizationPercent: number(r[7], 100), temperatureCelsius: number(r[8], 200),
      powerWatts: number(r[9]), powerLimitWatts: number(r[10]),
      performanceState: /^P\d{1,2}$/.test(r[11]) ? r[11] : null, fanPercent: number(r[12], 100),
      processes: processes?.slice(0, 32) ?? null, processCount: processes?.length ?? null,
    });
  }
  return { available: devices.length > 0, devices };
}
