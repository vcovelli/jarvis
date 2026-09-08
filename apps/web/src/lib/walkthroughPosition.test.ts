import assert from "node:assert/strict";
import test from "node:test";
import { positionGuide, type GuideRect } from "./walkthroughPosition.ts";

const bounds = { left: 0, top: 0, width: 390, height: 480 };
const size = { width: 248, height: 56 };
const right = (r: GuideRect) => r.left + r.width;
const bottom = (r: GuideRect) => r.top + r.height;

test("pointers flip away from the bottom dock and stay inside narrow screen edges", () => {
  const target = { left: 324, top: 418, width: 48, height: 48 };
  const result = positionGuide(target, bounds, size)!;
  assert.equal(result.tooltip?.placement, "top");
  assert.ok(result.tooltip!.left >= bounds.left);
  assert.ok(right(result.tooltip!) <= right(bounds));
  assert.ok(bottom(result.tooltip!) < target.top);
});

test("phone landscape uses side space without covering the real control", () => {
  const target = { left: 390, top: 36, width: 48, height: 48 };
  const result = positionGuide(target, { left: 0, top: 0, width: 844, height: 120 }, size)!;
  assert.equal(result.tooltip?.placement, "right");
  assert.ok(result.tooltip!.left > right(target));
});

test("visual viewport offsets and clipping keep hints out of a keyboard", () => {
  const visible = { left: 10, top: 140, width: 370, height: 180 };
  const result = positionGuide({ left: 20, top: 260, width: 320, height: 140 }, visible, size)!;
  assert.equal(bottom(result.highlight), bottom(visible));
  assert.ok(result.tooltip!.top >= visible.top);
  assert.ok(bottom(result.tooltip!) <= bottom(visible));
});

test("very small spaces preserve only the spotlight; fully scrolled-out targets disappear", () => {
  assert.equal(positionGuide({ left: 0, top: 0, width: 390, height: 480 }, bounds, size)?.tooltip, null);
  assert.equal(positionGuide({ left: 0, top: 600, width: 100, height: 44 }, bounds, size), null);
});
