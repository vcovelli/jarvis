# Covelli server system and power panel

The Operations page now opens with an independent live system panel. It does
not require an Operations profile or enabled autonomous worker. ADMIN/OWNER
authorization applies to both the page and `GET /api/operations/system`.

The panel reads the existing local NUT UPS (`ups@127.0.0.1`) and Prometheus.
It shows utility/battery state, charge, estimated runtime, UPS output, CPU,
temperature, memory, disks, uptime, service checks and backup-job results.
Power history is collected only while the panel is open (up to 15 minutes);
CPU and temperature history come from the previous hour in Prometheus.

## Interpretation

- `ups.realpower` is measured UPS output when available. Otherwise, load ×
  `ups.realpower.nominal` is an explicitly labeled estimate. Apparent power
  in VA is never interpreted as watts. All connected equipment is included;
  server-only draw, wall consumption and conversion losses are not measured.
- The APC currently reports load and rated watts, but not measured output.
- NUT failure/stale data never become zero or healthy. Low battery, on-battery,
  overload, replacement, bypass, alarms and forced shutdown have distinct warnings.
- The server refreshes every 15 seconds while visible, resumes immediately on
  visibility/network recovery, and marks client readings stale after 45 seconds.
  Failed refreshes retain old values with a visible warning; authorization loss
  clears the previous readings and power history.
- The NUT shutdown monitor's running state is visible. This is not proof of
  physical outlet wiring, configured shutdown thresholds or an outage drill.
  The UPS self-test result is displayed without initiating a test.
- Backup rows describe systemd job outcomes, not restore integrity. Missing
  completion timestamps remain unverified, even when systemd says `success`.
  Successful jobs older than 36 hours are overdue. Manually executed backup
  scripts do not necessarily populate systemd's completion timestamp.

## Boundaries

The endpoint uses fixed `/usr/bin/upsc` and `/usr/bin/systemctl show` commands
with argument arrays, no shell, three-second timeouts and bounded output. It
cannot accept request-specified targets, start/stop services, execute UPS
commands, read NUT credential files, or access Docker. Device serial numbers
and raw command errors are excluded. Authentication runs before collection;
HTTP responses are private/no-store. Successful server snapshots are cached
for ten seconds and concurrent refreshes share an in-flight collection.

## Verification

`npm test` includes power parser and backup-state tests. The browser check in
`apps/web/scripts/test-system-panel.mjs` refuses any database except
`jarvis_power_test` on `/tmp/jarvis-power-test/socket`. It uses synthetic users
and authentic sessions, checks anonymous/member/owner API access, reads real
UPS telemetry, and simulates browser responses for battery operation, stale
data, service failure and revoked access. It checks 1440, 390 and 320 px layouts.
It does not send control commands to the UPS or write to production data.

## NVIDIA GPU telemetry (17.10.0)

The panel also reads NVIDIA GPU utilization, used/free/total VRAM, board power,
power limit, temperature, fan speed, driver and performance state using fixed
`/usr/bin/nvidia-smi` CSV queries. Each GPU has its own card and compute-process
list with PID, executable basename and VRAM usage. Full executable paths and
device UUIDs are not returned to the browser. Graphics-only processes are not
included by the compute-process query.

GPU watts are NVIDIA-reported measurements, distinct from the UPS estimate.
They are already included in UPS load and must not be added to it. Unsupported
metrics remain unavailable; a failed process query is not an empty process list.
Driver failures show unavailable telemetry, and stale snapshots cannot show an
Idle/Active badge as current. This uses the same admin-only endpoint, bounded
timeouts, server cache, 15-second refresh and access-revocation handling.

Validation includes 94 unit/regression tests and authenticated browser checks
with live NVIDIA readings, simulated active processes, failed GPU collection,
stale readings and revoked access at desktop and 390/320 px phone widths.

No schema migration, dependency addition, privileged service change or model
request is needed for this feature. Build in an isolated checkout. Preserve
the current production build and source before swapping the verified build
and restarting the existing Jarvis PM2 process. Roll back by restoring those
files/build and restarting that same process; no database rollback is needed.
