import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("workspace migration preserves existing records in the main project", async () => {
  const database = await readFile(new URL("lib/database.ts", root), "utf8");
  assert.match(database, /export const MAIN_WORKSPACE_ID = "workspace-main"/);
  assert.match(database, /MAIN_WORKSPACE_ID, "EdUser"/);
  assert.match(database, /ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT/);
  assert.match(database, /WHERE workspace_id = \? ORDER BY year DESC/);
  assert.doesNotMatch(database, /CREATE UNIQUE INDEX IF NOT EXISTS months_year_month_idx/);
  assert.match(database, /DROP INDEX IF EXISTS months_year_month_idx/);
  assert.match(database, /months_workspace_period_idx ON months\(workspace_id, year, month\)/);
});

test("new projects receive their own month and reference data", async () => {
  const route = await readFile(new URL("app/api/payroll/route.ts", root), "utf8");
  assert.match(route, /action === "createWorkspace"/);
  assert.match(route, /INSERT INTO workspaces/);
  assert.match(route, /INSERT INTO months \(id, year, month, workspace_id\)/);
  assert.match(route, /INSERT INTO departments \(id, name, sort_order, workspace_id\)/);
  assert.match(route, /INSERT INTO payment_methods \(id, name, sort_order, is_system, workspace_id\)/);
  assert.match(route, /INSERT INTO expense_categories \(id, name, sort_order, workspace_id\)/);
});

test("workspace switcher is located immediately above logout", async () => {
  const navigation = await readFile(new URL("app/components/AppNavigation.vue", root), "utf8");
  const header = await readFile(new URL("app/components/PeriodHeader.vue", root), "utf8");
  const switcher = await readFile(new URL("app/components/WorkspaceSwitcher.vue", root), "utf8");
  assert.match(navigation, /<WorkspaceSwitcher \/>\s+<button class="sidebar-logout"/);
  assert.doesNotMatch(header, /WorkspaceSwitcher/);
  assert.match(switcher, /payroll\.switchWorkspace/);
  assert.match(switcher, /workspace-switcher sidebar-workspace-switcher/);
  assert.match(switcher, /createWorkspace/);
});

test("mobile users can switch projects from settings", async () => {
  const navigation = await readFile(new URL("app/components/AppNavigation.vue", root), "utf8");
  const settings = await readFile(new URL("app/pages/settings.vue", root), "utf8");
  const styles = await readFile(new URL("app/assets/css/main.css", root), "utf8");
  assert.match(navigation, /startSettingsHold/);
  assert.match(navigation, /setTimeout\(\(\) => \{[\s\S]*projectSheetOpen\.value = true;[\s\S]*\}, 520\)/);
  assert.match(navigation, /class="project-sheet-backdrop"/);
  assert.match(navigation, /payroll\.switchWorkspace\(id\)/);
  assert.doesNotMatch(settings, /mobile-project-switcher/);
  assert.doesNotMatch(settings, /id: "projects" as const/);
  assert.match(styles, /project-sheet-options button\.active/);
  assert.match(styles, /table-toolbar > \.search-field \{ width: min\(100%,340px\); \}/);
});

test("TamshyLab uses its own workspace color palette", async () => {
  const shell = await readFile(new URL("app/components/AppShell.vue", root), "utf8");
  const styles = await readFile(new URL("app/assets/css/main.css", root), "utf8");
  assert.match(shell, /name === "tamshylab" \? "theme-tamshylab"/);
  for (const color of ["#39c6b5", "#1f2a44", "#334155", "#ffd85a", "#495cf8", "#eafbf8"]) {
    assert.match(styles, new RegExp(color));
  }
});

test("new employees start at zero but base salary remains editable", async () => {
  const form = await readFile(new URL("app/components/EmployeeForm.vue", root), "utf8");
  const route = await readFile(new URL("app/api/payroll/route.ts", root), "utf8");
  assert.match(form, /props\.employee\?\.baseSalary \?\? 0/);
  assert.match(form, /<span>Негізгі айлық<\/span>/);
  assert.doesNotMatch(form, /v-if="!fixedZeroBaseSalary"/);
  assert.match(route, /const baseSalary = money\(body\.baseSalary, "Негізгі айлық"\)/);
  assert.doesNotMatch(route, /fixedZeroBaseSalary/);
});
