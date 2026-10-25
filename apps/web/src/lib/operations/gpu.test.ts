import test from "node:test";
import assert from "node:assert/strict";
import { parseGpu } from "./gpu.ts";
const sample = "0, NVIDIA GeForce RTX 3070, GPU-test, 535.309.01, 8192, 1, 7969, 0, 44, 27.09, 240.00, P8, 0";
test("idle readings retain zero values and actual driver-reported free memory", () => {
  const gpu = parseGpu(sample, "").devices[0];
  assert.equal(gpu.utilizationPercent, 0); assert.equal(gpu.powerWatts, 27.09);
  assert.equal(gpu.fanPercent, 0); assert.equal(gpu.memoryFreeMiB, 7969);
  assert.deepEqual(gpu.processes, []); assert.equal(gpu.processCount, 0);
});
test("unavailable driver and unsupported metrics never imply idle or zero power", () => {
  for (const raw of [null, "", "NVIDIA-SMI has failed", "0, incomplete"]) assert.equal(parseGpu(raw, null).available, false);
  const gpu = parseGpu(sample.replace(", 0, 44, 27.09", ", N/A, [Not Supported], N/A"), null).devices[0];
  assert.equal(gpu.utilizationPercent, null); assert.equal(gpu.temperatureCelsius, null);
  assert.equal(gpu.powerWatts, null); assert.equal(gpu.processes, null);
});
test("processes are associated per GPU and names omit private filesystem paths", () => {
  const raw = sample + "\n" + sample.replace("0, NVIDIA", "1, NVIDIA").replace("GPU-test", "GPU-second");
  const gpus = parseGpu(raw, 'GPU-test, 123, "/home/private/models/runner,local", 2048\nGPU-second, 456, /usr/bin/python, 1024');
  assert.deepEqual(gpus.devices[0].processes, [{ pid: 123, name: "runner,local", memoryMiB: 2048 }]);
  assert.equal(gpus.devices[1].processCount, 1);
  assert.ok(!JSON.stringify(gpus).includes("/home/private"));
  assert.ok(!JSON.stringify(gpus).includes("GPU-test"));
});
test("process query failure or malformed output stays unknown, while unsupported process memory stays null", () => {
  assert.equal(parseGpu(sample, "not supported").devices[0].processes, null);
  assert.equal(parseGpu(sample, "GPU-test, 42, python, N/A").devices[0].processes?.[0].memoryMiB, null);
});
