import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDockerContainerStatus, parseDockerContainerStatuses } from "./homelabStatus.ts";

test("Docker service inventory recognizes healthy Jellyfin and Navidrome containers", () => {
  const table = `CONTAINER ID   IMAGE                     COMMAND              CREATED       STATUS                 PORTS                         NAMES
8878d1834d43   deluan/navidrome:0.55.1   "/app/navidrome"     3 weeks ago   Up 3 weeks (healthy)   0.0.0.0:4533->4533/tcp       navidrome
42803c167894   jellyfin/jellyfin:10.10.7 "/jellyfin/jellyfin" 3 weeks ago   Up 20 hours (healthy)  0.0.0.0:8096->8096/tcp       jellyfin`;
  const statuses = parseDockerContainerStatuses(table);
  assert.equal(statuses.get("jellyfin")?.status, "active");
  assert.equal(statuses.get("navidrome")?.status, "active");
});

test("Docker health and lifecycle states do not report unhealthy containers as active", () => {
  assert.equal(normalizeDockerContainerStatus("Up 8 seconds (health: starting)"), "starting");
  assert.equal(normalizeDockerContainerStatus("Up 3 minutes (unhealthy)"), "unhealthy");
  assert.equal(normalizeDockerContainerStatus("Restarting (1) 4 seconds ago"), "restarting");
  assert.equal(normalizeDockerContainerStatus("Exited (0) 2 hours ago"), "inactive");
});
