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

test("Cloudflare Worker uses the free-compatible always-ready configuration", async () => {
  const workerConfig = JSON.parse(
    await readFile(new URL("wrangler.jsonc", root), "utf8"),
  ) as {
    name: string;
    main: string;
    compatibility_flags: string[];
    assets: { directory: string };
    secrets: { required: string[] };
  };
  assert.equal(workerConfig.name, "payroll-dashboard");
  assert.equal(workerConfig.main, ".output/server/index.mjs");
  assert.deepEqual(workerConfig.compatibility_flags, ["nodejs_compat"]);
  assert.equal(workerConfig.assets.directory, ".output/public");
  assert.deepEqual(workerConfig.secrets.required.sort(), [
    "APP_PASSWORD_HASH",
    "DATABASE_URL",
    "SESSION_SECRET",
  ]);

  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  ) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  assert.match(packageJson.scripts["build:worker"], /nuxt build --preset=cloudflare_module/);
  assert.ok(packageJson.dependencies.nuxt);
  assert.ok(packageJson.dependencies["@neondatabase/serverless"]);
  assert.equal(packageJson.dependencies.pg, undefined);
});

test("Render fallback remains on the free instance plan", async () => {
  const blueprint = await readFile(new URL("render.yaml", root), "utf8");
  assert.match(blueprint, /^\s+plan:\s+free\s*$/m);
  assert.doesNotMatch(blueprint, /^\s+plan:\s+(starter|standard|pro)\s*$/m);
});
