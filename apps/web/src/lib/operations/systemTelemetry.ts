import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hostname } from "node:os";
import { getMonitoringSummary } from "../prometheus";
import { parseBackup, parsePower } from "./power";
import { GPU_QUERY, GPU_PROCESS_QUERY, parseGpu } from "./gpu";

const run = promisify(execFile);
// Fixed read-only commands, no shell, caller-supplied arguments, sudo, or credentials.
async function read(command: string, args: string[]) {
  try {
    const { stdout } = await run(command, args, { timeout: 3000, maxBuffer: 64 * 1024, env: { ...process.env, LC_ALL: "C", TZ: "UTC" } });
    return stdout;
  } catch { return null; }
}
const serviceNames = [
  ["UPS shutdown monitor", "nut-monitor.service"],
  ["UPS data service", "nut-server.service"],
  ["Tailscale", "tailscaled.service"],
  ["Web proxy", "nginx.service"],
] as const;

async function collect() {
  const [monitoring, rawUps, services, backups, gpu] = await Promise.all([
    getMonitoringSummary(),
    read("/usr/bin/upsc", ["ups@127.0.0.1"]),
    Promise.all(serviceNames.map(async ([name, unit]) => {
      const state = await read("/usr/bin/systemctl", ["show", unit, "--property=ActiveState", "--value"]);
      return { name, state: state?.trim() || "unknown" };
    })),
    Promise.all(([ ["Server → Synology", "covelli-backup.service"], ["Vaultwarden → Synology", "vaultwarden-backup.service"] ] as const).map(async ([name, unit]) =>
      parseBackup(name, await read("/usr/bin/systemctl", ["show", unit, "--property=ActiveState,Result,ExecMainStatus,ExecMainExitTimestamp"]))
    )),
    Promise.all([
      read("/usr/bin/nvidia-smi", [`--query-gpu=${GPU_QUERY}`, "--format=csv,noheader,nounits"]),
      read("/usr/bin/nvidia-smi", [`--query-compute-apps=${GPU_PROCESS_QUERY}`, "--format=csv,noheader,nounits"]),
    ]).then(([devices, processes]) => parseGpu(devices, processes)),
  ]);
  return { generatedAt: new Date().toISOString(), host: hostname(), power: parsePower(rawUps), monitoring, services, backups, gpu };
}
export type SystemTelemetry = Awaited<ReturnType<typeof collect>>;
let cached: SystemTelemetry | null = null;
let pending: Promise<SystemTelemetry> | null = null;
export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  if (cached && Date.now() - Date.parse(cached.generatedAt) < 10_000) return cached;
  if (pending) return pending;
  pending = collect().then(result => { cached = result; return result; }).finally(() => { pending = null; });
  return pending;
}
