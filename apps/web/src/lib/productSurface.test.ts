import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { userGuides } from "./userGuides.ts";

const retired = ["manufacturing", "career", "fitness", "focus"];
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const pageExists = (route: string) => existsSync(new URL(`../app${route.split("?")[0]}/page.tsx`, import.meta.url));

test("retired placeholder routes and their unused component are absent", () => {
  for (const area of retired) assert.equal(pageExists(`/v2/${area}`), false, area);
  assert.equal(existsSync(new URL("../components/ModuleBrief.tsx", import.meta.url)), false);
});

test("shared desktop and mobile navigation and every guide point to working pages", () => {
  const sidebar = read("../components/Sidebar.tsx");
  const links = Array.from(sidebar.matchAll(/href:\s*"([^"]+)"/g), (match) => `/v2${match[1] === "/" ? "" : match[1]}`);
  assert.ok(links.length > 10);
  for (const route of links) assert.ok(pageExists(route), `${route} must exist`);
  for (const guide of userGuides) {
    for (const step of guide.steps) assert.ok(pageExists(step.route), `${guide.id}: ${step.route} must exist`);
  }
  for (const area of retired) assert.ok(!links.some((route) => route.split("?")[0] === `/v2/${area}`));
});

test("application code has no navigation or command references to retired routes", () => {
  function inspect(directory: URL) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) inspect(path);
      else if (/\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const source = readFileSync(path, "utf8");
        for (const area of retired) {
          assert.doesNotMatch(source, new RegExp(`/["']?(?:v2/)?${area}(?:["'/?#]|$)`), path.pathname);
        }
      }
    }
  }
  inspect(new URL("../", import.meta.url));
});

test("built-in Assistant labels and starter copy do not advertise retired modules", () => {
  const assistant = read("../app/v2/assistant/page.tsx");
  assert.doesNotMatch(assistant, /(?:label|detail):\s*"[^"]*\b(?:Manufacturing|Career|Fitness)\b/);
  assert.match(assistant, /key: "career", label: "Work goals"/);
  assert.match(assistant, /key: "fitness", label: "Movement"/);
  assert.match(assistant, /id: "career-finances"/); // Preserve stored project memory and preferences.
  assert.doesNotMatch(read("../app/v2/habits/page.tsx"), /category: "Fitness"/);
  assert.doesNotMatch(read("../app/v2/objectives/page.tsx"), /placeholder="[^"]*(?:manufacturing|Career)/);
});
