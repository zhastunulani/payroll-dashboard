import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET } from "../app/api/ping/route.ts";

const root = new URL("../", import.meta.url);

test("public ping responds without touching protected payroll data", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });

  const route = await readFile(
    new URL("app/api/ping/route.ts", root),
    "utf8",
  );
  assert.doesNotMatch(route, /database|payroll|salary|expense/i);
});

test("Render remains on the free instance plan", async () => {
  const blueprint = await readFile(new URL("render.yaml", root), "utf8");
  assert.match(blueprint, /^\s+plan:\s+free\s*$/m);
  assert.doesNotMatch(blueprint, /^\s+plan:\s+(starter|standard|pro)\s*$/m);
});
