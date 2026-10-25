export type PowerState = "online" | "battery" | "warning" | "critical" | "unknown";
export type PowerReading = {
  available: boolean; state: PowerState; label: string; flags: string[];
  model: string | null; chargePercent: number | null; runtimeSeconds: number | null;
  loadPercent: number | null; watts: number | null; wattsSource: "measured" | "estimated" | "unavailable";
  nominalWatts: number | null; inputVolts: number | null; batteryVolts: number | null;
  lowRuntimeSeconds: number | null; lowChargePercent: number | null;
  selfTest: string | null; alerts: string[];
};

export function parsePower(output: string | null): PowerReading {
  const fields = new Map<string, string>();
  for (const line of (output ?? "").split(/\r?\n/)) {
    const split = line.indexOf(": ");
    if (split > 0) fields.set(line.slice(0, split), line.slice(split + 2).trim());
  }
  const number = (key: string, max = Number.MAX_SAFE_INTEGER) => {
    const raw = fields.get(key);
    if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n <= max ? n : null;
  };
  const flags = (fields.get("ups.status") ?? "").split(/\s+/).filter(Boolean);
  const available = Boolean(output && flags.length && !flags.includes("NOCOMM") && !output.includes("ERR DATA-STALE"));
  const chargePercent = available ? number("battery.charge", 100) : null;
  const runtimeSeconds = available ? number("battery.runtime") : null;
  const loadPercent = available ? number("ups.load", 200) : null;
  const nominalWatts = available ? number("ups.realpower.nominal") : null;
  const measured = available ? number("ups.realpower") : null;
  const lowRuntimeSeconds = available ? number("battery.runtime.low") : null;
  const lowChargePercent = available ? number("battery.charge.low", 100) : null;
  const watts = measured ?? (loadPercent !== null && nominalWatts !== null && nominalWatts > 0 ? Math.round(loadPercent * nominalWatts / 100) : null);
  const alerts: string[] = [];
  if (!available) alerts.push("UPS telemetry unavailable. Battery coverage cannot be confirmed.");
  const warnings: Record<string, string> = {
    OB: "Utility power lost. Equipment is running on battery.",
    LB: "UPS reports low battery.", RB: "UPS requests a battery replacement.",
    OVER: "UPS is overloaded. Reduce connected load.", OFF: "UPS output is off.",
    BYPASS: "UPS is in bypass; battery protection may be unavailable.",
    FSD: "Forced shutdown is in progress.", ALARM: "UPS reports an alarm.",
    CAL: "Battery calibration is in progress; runtime may change.",
  };
  if (available) for (const flag of flags) if (warnings[flag]) alerts.push(warnings[flag]);
  const reserveLow = (chargePercent !== null && chargePercent <= (lowChargePercent ?? 20)) ||
    (runtimeSeconds !== null && runtimeSeconds <= (lowRuntimeSeconds ?? 300));
  if (available && reserveLow) alerts.push("Battery reserve is low for the current load.");
  if (available && (chargePercent === null || runtimeSeconds === null)) alerts.push("Battery charge or runtime is not reported by the UPS.");
  const critical = flags.some(f => ["LB", "OVER", "OFF", "FSD"].includes(f)) || (flags.includes("OB") && reserveLow);
  const state: PowerState = !available ? "unknown" : critical ? "critical" : flags.includes("OB") ? "battery" :
    alerts.length ? "warning" : flags.includes("OL") ? "online" : "unknown";
  const label = { online: "On utility power", battery: "Running on battery", warning: "Power needs attention", critical: "Power at risk", unknown: "Power status unknown" }[state];
  return {
    available, state, label, flags: available ? flags : [],
    model: fields.get("ups.model")?.slice(0, 100) ?? null,
    chargePercent, runtimeSeconds, loadPercent, watts,
    wattsSource: measured !== null ? "measured" : watts !== null ? "estimated" : "unavailable",
    nominalWatts, inputVolts: available ? number("input.voltage", 1000) : null,
    batteryVolts: available ? number("battery.voltage", 1000) : null,
    lowRuntimeSeconds, lowChargePercent, selfTest: available ? fields.get("ups.test.result")?.slice(0, 160) ?? null : null, alerts,
  };
}

export type BackupReading = { name: string; state: "success" | "failed" | "running" | "stale" | "unknown"; completedAt: string | null };
export function parseBackup(name: string, output: string | null, now = Date.now()): BackupReading {
  const values = new Map((output ?? "").trim().split("\n").map(line => {
    const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];
  }));
  const stamp = Date.parse(values.get("ExecMainExitTimestamp") ?? "");
  const completedAt = Number.isFinite(stamp) && stamp > 0 && stamp <= now ? new Date(stamp).toISOString() : null;
  const state = values.get("ActiveState") === "activating" ? "running" :
    !output ? "unknown" : values.get("Result") && values.get("Result") !== "success" ? "failed" :
    !completedAt ? "unknown" : values.get("ExecMainStatus") !== "0" ? "failed" : now - stamp > 36 * 3600_000 ? "stale" : "success";
  return { name, state, completedAt };
}
