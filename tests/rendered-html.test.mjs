import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the dashboard behind the server-side password gate", async () => {
  const [page, app, auth] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/PayrollApp.tsx", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
  ]);
  assert.match(page, /await isPageAuthenticated\(\)/);
  assert.match(page, /authenticated \? <PayrollApp \/> : <LoginPage \/>/);
  assert.match(app, /Ортақ пароль/);
  assert.match(app, /Деректер қорғалған/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /PBKDF2/);
});

test("ships the requested Kazakh design system without starter content", async () => {
  const [layout, styles, page, packageJson] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(layout, /<html lang="kk">/);
  assert.match(layout, /Inter/);
  assert.match(styles, /--primary:\s*#495cf8/i);
  assert.match(styles, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
