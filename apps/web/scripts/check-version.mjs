import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const pkg = read("package.json");
const lock = read("package-lock.json");
assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
assert.equal(lock.version, pkg.version, "Lockfile version must match package.json");
assert.equal(lock.packages?.[""]?.version, pkg.version, "Lockfile root package must match package.json");
const ref = process.env.GITHUB_REF ?? "";
if (ref.startsWith("refs/tags/v")) {
  assert.equal(ref.slice("refs/tags/v".length), pkg.version, "Release tag must match package.json");
}
console.log(`Release metadata agrees at ${pkg.version}`);
