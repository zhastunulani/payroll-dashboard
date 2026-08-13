import { buildBreakdown, computeStats, monthLabel, salaryTotal } from "./calculations";
import {
  OTHER_EXPENSE_CATEGORY_ID,
  OTHER_EXPENSE_CATEGORY_NAME,
} from "./expenses";
import { PostgresDatabase } from "./postgres-database";
import type {
  ExpenseRecord,
  PayrollData,
  SalaryRecord,
} from "./types";

type RuntimeEnv = {
  DATABASE_URL?: string;
  APP_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};

export const MAIN_WORKSPACE_ID = "workspace-main";

export function workspaceInitials(name: string): string {
  return name.trim().slice(0, 1).toLocaleUpperCase("kk-KZ") || "Ж";
}

let initialization: Promise<void> | null = null;
let database: PostgresDatabase | null = null;
const settingCache = new Map<
  string,
  { value: string | null; expiresAt: number }
>();
const SETTING_CACHE_MS = 30_000;
let settingsLoading: Promise<void> | null = null;

export function runtimeEnv(): RuntimeEnv {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    APP_PASSWORD_HASH: process.env.APP_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
}

export function getRawDb(): PostgresDatabase {
  if (database) return database;
  const connectionString = runtimeEnv().DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL бапталмаған.");
  database = new PostgresDatabase(connectionString);
  return database;
}

export async function ensureDatabase(): Promise<void> {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

async function initializeDatabase(): Promise<void> {
  const db = getRawDb();
  const existingSchema = await db
    .prepare(
      `SELECT to_regclass('public.app_settings')::text AS table_name,
              to_regclass('public.workspaces')::text AS workspaces_table,
              EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'salary_snapshots'
                  AND column_name = 'note'
              ) AS has_salary_note,
              (
                SELECT COUNT(*) = 2
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'expenses'
                  AND column_name IN ('department_id', 'department_name')
              ) AS has_expense_department,
              (
                SELECT COUNT(*) = 7
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name IN (
                    'months', 'departments', 'payment_methods', 'employees',
                    'salary_snapshots', 'expense_categories', 'expenses'
                  )
                  AND column_name = 'workspace_id'
              ) AS has_workspace_scope`,
    )
    .first<{
      table_name: string | null;
      workspaces_table: string | null;
      has_salary_note: boolean;
      has_expense_department: boolean;
      has_workspace_scope: boolean;
    }>();
  // Schema migrations are only required for a new or outdated database. The
  // old path executed every CREATE/ALTER/seed batch whenever Workers created a
  // fresh isolate, adding several remote database round trips to normal API
  // requests and even to login.
  if (
    existingSchema?.table_name &&
    existingSchema.workspaces_table &&
    existingSchema.has_salary_note &&
    existingSchema.has_expense_department &&
    existingSchema.has_workspace_scope
  ) return;

  if (existingSchema?.table_name && !existingSchema.has_salary_note) {
      await db
        .prepare(
          "ALTER TABLE salary_snapshots ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''",
        )
        .run();
  }
  if (existingSchema?.table_name && !existingSchema.has_expense_department) {
    await db.batch([
      db.prepare("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department_id TEXT"),
      db.prepare("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department_name TEXT"),
    ]);
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS months (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      source_month_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      department_id TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS salary_snapshots (
      id TEXT PRIMARY KEY,
      month_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      department_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT '',
      department_name TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      payment_method_name TEXT NOT NULL,
      base_salary INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      is_paid INTEGER NOT NULL DEFAULT 0,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS salary_month_employee_idx ON salary_snapshots(month_id, employee_id)`,
    `CREATE INDEX IF NOT EXISTS salary_month_idx ON salary_snapshots(month_id)`,
    `CREATE TABLE IF NOT EXISTS salary_components (
      id TEXT PRIMARY KEY,
      salary_snapshot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('addition', 'deduction')),
      amount INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS salary_components_snapshot_idx ON salary_components(salary_snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      month_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      name TEXT NOT NULL,
      department_id TEXT,
      department_name TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 1,
      is_paid INTEGER NOT NULL DEFAULT 0,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS expenses_month_idx ON expenses(month_id)`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));

  await db.batch([
    "months", "departments", "payment_methods", "employees",
    "salary_snapshots", "expense_categories", "expenses",
  ].map((table) => db.prepare(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT '${MAIN_WORKSPACE_ID}'`,
  )));
  await db.batch([
    db.prepare("DROP INDEX IF EXISTS months_year_month_idx"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS months_workspace_period_idx ON months(workspace_id, year, month)"),
    db.prepare("CREATE INDEX IF NOT EXISTS salary_workspace_month_idx ON salary_snapshots(workspace_id, month_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS expenses_workspace_month_idx ON expenses(workspace_id, month_id)"),
  ]);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthId = `${year}-${String(month).padStart(2, "0")}`;

  const seedStatements = [
    db.prepare(
      "INSERT OR IGNORE INTO workspaces (id, name, sort_order) VALUES (?, ?, 1)",
    ).bind(MAIN_WORKSPACE_ID, "EdUser"),
    db
      .prepare(
        `INSERT INTO months (id, year, month, workspace_id)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM months WHERE workspace_id = ?)
         ON CONFLICT DO NOTHING`,
      )
      .bind(monthId, year, month, MAIN_WORKSPACE_ID, MAIN_WORKSPACE_ID),
    ...[
      ["dept-academ", "Академ", 1],
      ["dept-teachers", "Мұғалімдер", 2],
      ["dept-marketing", "Маркетинг Eduser", 3],
      ["dept-ustaz-media", "Ustaz Media", 4],
      ["dept-curators", "Кураторлар", 5],
      ["dept-sales", "Сату бөлімі", 6],
    ].map(([id, name, order]) =>
      db
        .prepare("INSERT OR IGNORE INTO departments (id, name, sort_order) VALUES (?, ?, ?)")
        .bind(id, name, order),
    ),
    ...[
      ["method-transfer", "Аударым", 1],
      ["method-official", "Ресми", 2],
      ["method-official-ip", "Ресми + ЖК", 3],
      ["method-ip", "ЖК", 4],
      ["method-self-employed", "Өзін-өзі жұмыспен қамтыған", 5],
    ].map(([id, name, order]) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO payment_methods (id, name, sort_order, is_system) VALUES (?, ?, ?, 1)",
        )
        .bind(id, name, order),
    ),
    ...[
      ["expense-rent", "Ғимарат арендасы", 1],
      ["expense-internet", "Интернет", 2],
      ["expense-tech", "Техникалық сервистер", 3],
      ["expense-subscriptions", "Подписка", 4],
      [OTHER_EXPENSE_CATEGORY_ID, OTHER_EXPENSE_CATEGORY_NAME, 5],
    ].map(([id, name, order]) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO expense_categories (id, name, sort_order) VALUES (?, ?, ?)",
        )
        .bind(id, name, order),
    ),
    db
      .prepare(
        `UPDATE expense_categories
         SET name = ?, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (name <> ? OR archived_at IS NOT NULL)`,
      )
      .bind(
        OTHER_EXPENSE_CATEGORY_NAME,
        OTHER_EXPENSE_CATEGORY_ID,
        OTHER_EXPENSE_CATEGORY_NAME,
      ),
    db
      .prepare(
        `UPDATE expenses
         SET category_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE category_id = ? AND category_name <> ?`,
      )
      .bind(
        OTHER_EXPENSE_CATEGORY_NAME,
        OTHER_EXPENSE_CATEGORY_ID,
        OTHER_EXPENSE_CATEGORY_NAME,
      ),
    db
      .prepare(
        `UPDATE expenses
         SET is_paid = 1,
             paid_at = COALESCE(paid_at, created_at),
             updated_at = CURRENT_TIMESTAMP
         WHERE category_id = ? AND is_recurring = 0
           AND (is_paid <> 1 OR paid_at IS NULL)`,
      )
      .bind(OTHER_EXPENSE_CATEGORY_ID),
    db
      .prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_version', '1')"),
  ];
  await db.batch(seedStatements);
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureDatabase();
  const cached = settingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  settingsLoading ??= (async () => {
    const rows = await queryAll<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
      "password_hash",
      "session_version",
    );
    const expiresAt = Date.now() + SETTING_CACHE_MS;
    for (const settingKey of ["password_hash", "session_version"]) {
      settingCache.set(settingKey, { value: null, expiresAt });
    }
    for (const row of rows) {
      settingCache.set(row.key, { value: row.value, expiresAt });
    }
  })().finally(() => {
    settingsLoading = null;
  });
  await settingsLoading;
  return settingCache.get(key)?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureDatabase();
  await getRawDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(key, value)
    .run();
  settingCache.set(key, { value, expiresAt: Date.now() + SETTING_CACHE_MS });
}

async function queryAll<T>(statement: string, ...values: unknown[]): Promise<T[]> {
  const result = await getRawDb().prepare(statement).bind(...values).all<T>();
  return result.results;
}

type SalaryRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  position: string;
  department_id: string;
  department_name: string;
  payment_method_id: string;
  payment_method_name: string;
  base_salary: number;
  note: string;
  is_paid: number;
  paid_at: string | null;
  archived_at: string | null;
};

async function loadSalaries(monthId: string): Promise<SalaryRecord[]> {
  const rows = await queryAll<SalaryRow & {
    component_id: string | null;
    component_name: string | null;
    component_kind: "addition" | "deduction" | null;
    component_amount: number | null;
  }>(
    `SELECT s.id, s.employee_id, s.employee_name, s.position, s.department_id, s.department_name,
             s.payment_method_id, s.payment_method_name, s.base_salary, s.note, s.is_paid,
             s.paid_at, e.archived_at,
             c.id AS component_id, c.name AS component_name,
             c.kind AS component_kind, c.amount AS component_amount
      FROM salary_snapshots s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN salary_components c ON c.salary_snapshot_id = s.id
      WHERE s.month_id = ? AND e.archived_at IS NULL
      ORDER BY s.department_name, s.employee_name, c.created_at, c.id`,
    monthId,
  );
  const salaries = new Map<string, SalaryRecord>();
  for (const row of rows) {
    let salary = salaries.get(row.id);
    if (!salary) {
      salary = {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      position: row.position,
      departmentId: row.department_id,
      departmentName: row.department_name,
      paymentMethodId: row.payment_method_id,
      paymentMethodName: row.payment_method_name,
      baseSalary: row.base_salary,
      note: row.note,
      components: [],
      total: row.base_salary,
      isPaid: Boolean(row.is_paid),
      paidAt: row.paid_at,
      archivedAt: row.archived_at,
      };
      salaries.set(row.id, salary);
    }
    if (
      row.component_id && row.component_name && row.component_kind &&
      row.component_amount !== null
    ) {
      salary.components.push({
        id: row.component_id,
        name: row.component_name,
        kind: row.component_kind,
        amount: row.component_amount,
      });
    }
  }
  return [...salaries.values()].map((salary) => ({
    ...salary,
    total: salaryTotal(salary.baseSalary, salary.components),
  }));
}

async function loadExpenses(monthId: string): Promise<ExpenseRecord[]> {
  const rows = await queryAll<{
    id: string;
    category_id: string;
    category_name: string;
    name: string;
    department_id: string | null;
    department_name: string | null;
    amount: number;
    is_recurring: number;
    is_paid: number;
    paid_at: string | null;
  }>(
    `SELECT id, category_id, category_name, name, department_id, department_name,
            amount, is_recurring, is_paid, paid_at
     FROM expenses WHERE month_id = ? ORDER BY category_name, name`,
    monthId,
  );
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    amount: row.amount,
    isRecurring: Boolean(row.is_recurring),
    isPaid: Boolean(row.is_paid),
    paidAt: row.paid_at,
    isOneTime:
      row.category_name === OTHER_EXPENSE_CATEGORY_NAME &&
      !row.is_recurring,
  }));
}

function groupedAmounts(
  salaries: SalaryRecord[],
): Array<{ id: string; name: string; amount: number }> {
  const map = new Map<string, { id: string; name: string; amount: number }>();
  for (const salary of salaries) {
    const current = map.get(salary.departmentId) ?? {
      id: salary.departmentId,
      name: salary.departmentName,
      amount: 0,
    };
    current.amount += salary.total;
    map.set(salary.departmentId, current);
  }
  return [...map.values()];
}

function groupedExpenses(
  expensesList: ExpenseRecord[],
): Array<{ id: string; name: string; amount: number }> {
  const map = new Map<string, { id: string; name: string; amount: number }>();
  for (const expense of expensesList) {
    const current = map.get(expense.categoryId) ?? {
      id: expense.categoryId,
      name: expense.categoryName,
      amount: 0,
    };
    current.amount += expense.amount;
    map.set(expense.categoryId, current);
  }
  return [...map.values()];
}

export async function loadPayrollData(
  requestedMonthId?: string,
  requestedWorkspaceId?: string,
): Promise<PayrollData> {
  await ensureDatabase();
  const [workspaceRows, requestedMonthRows] = await Promise.all([
    queryAll<{ id: string; name: string; sort_order: number }>(
      "SELECT id, name, sort_order FROM workspaces ORDER BY sort_order, created_at",
    ),
    requestedWorkspaceId
      ? queryAll<{ id: string; year: number; month: number }>(
          "SELECT id, year, month FROM months WHERE workspace_id = ? ORDER BY year DESC, month DESC",
          requestedWorkspaceId,
        )
      : Promise.resolve(null),
  ]);
  const selectedWorkspace = workspaceRows.find((item) => item.id === requestedWorkspaceId)
    ?? workspaceRows[0];
  if (!selectedWorkspace) throw new Error("Жоба табылмады.");
  const monthRows = requestedWorkspaceId === selectedWorkspace.id && requestedMonthRows
    ? requestedMonthRows
    : await queryAll<{ id: string; year: number; month: number }>(
        "SELECT id, year, month FROM months WHERE workspace_id = ? ORDER BY year DESC, month DESC",
        selectedWorkspace.id,
      );
  const selectedIndex = Math.max(
    0,
    monthRows.findIndex((month) => `${month.year}-${String(month.month).padStart(2, "0")}` === requestedMonthId),
  );
  const selectedRow = monthRows[selectedIndex] ?? monthRows[0];
  if (!selectedRow) throw new Error("Есептік ай табылмады.");
  const previousRow = monthRows[selectedIndex + 1] ?? null;

  const [salaryRows, expenseRows, previousSalaries, previousExpenses, departmentRows, methodRows, categoryRows] =
    await Promise.all([
      loadSalaries(selectedRow.id),
      loadExpenses(selectedRow.id),
      previousRow ? loadSalaries(previousRow.id) : Promise.resolve([]),
      previousRow ? loadExpenses(previousRow.id) : Promise.resolve([]),
      queryAll<{
        id: string;
        name: string;
        sort_order: number;
        archived_at: string | null;
      }>("SELECT id, name, sort_order, archived_at FROM departments WHERE workspace_id = ? ORDER BY sort_order, name", selectedWorkspace.id),
      queryAll<{
        id: string;
        name: string;
        sort_order: number;
        is_system: number;
        archived_at: string | null;
      }>(
        "SELECT id, name, sort_order, is_system, archived_at FROM payment_methods WHERE workspace_id = ? ORDER BY sort_order, name",
        selectedWorkspace.id,
      ),
      queryAll<{
        id: string;
        name: string;
        sort_order: number;
        archived_at: string | null;
      }>(
        "SELECT id, name, sort_order, archived_at FROM expense_categories WHERE workspace_id = ? ORDER BY sort_order, name",
        selectedWorkspace.id,
      ),
    ]);

  const departmentNames = new Map(
    salaryRows.map((salary) => [salary.departmentId, salary.departmentName]),
  );
  const visibleDepartments = departmentRows.filter(
    (department) => !department.archived_at || departmentNames.has(department.id),
  );
  const departmentsData = visibleDepartments.map((department) => {
    const departmentEmployees = salaryRows.filter(
      (salary) => salary.departmentId === department.id,
    );
    const total = departmentEmployees.reduce((sum, salary) => sum + salary.total, 0);
    const paid = departmentEmployees.reduce(
      (sum, salary) => sum + (salary.isPaid ? salary.total : 0),
      0,
    );
    return {
      id: department.id,
      name: departmentNames.get(department.id) ?? department.name,
      sortOrder: department.sort_order,
      archivedAt: department.archived_at,
      employees: departmentEmployees,
      total,
      paid,
      remaining: Math.max(0, total - paid),
    };
  });

  return {
    workspaces: workspaceRows.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      initials: workspaceInitials(workspace.name),
    })),
    selectedWorkspace: {
      id: selectedWorkspace.id,
      name: selectedWorkspace.name,
      initials: workspaceInitials(selectedWorkspace.name),
    },
    months: monthRows.map((month) => ({
      id: `${month.year}-${String(month.month).padStart(2, "0")}`,
      year: month.year,
      month: month.month,
      label: monthLabel(month.year, month.month),
    })),
    selectedMonth: {
      id: `${selectedRow.year}-${String(selectedRow.month).padStart(2, "0")}`,
      year: selectedRow.year,
      month: selectedRow.month,
      label: monthLabel(selectedRow.year, selectedRow.month),
    },
    previousMonth: previousRow
      ? {
          id: `${previousRow.year}-${String(previousRow.month).padStart(2, "0")}`,
          label: monthLabel(previousRow.year, previousRow.month),
        }
      : null,
    departments: departmentsData,
    salaries: salaryRows,
    expenses: expenseRows,
    paymentMethods: methodRows.map((method) => ({
      id: method.id,
      name: method.name,
      sortOrder: method.sort_order,
      isSystem: Boolean(method.is_system),
      archivedAt: method.archived_at,
    })),
    expenseCategories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
      archivedAt: category.archived_at,
      isOtherExpense: category.name === OTHER_EXPENSE_CATEGORY_NAME,
    })),
    stats: computeStats(salaryRows, expenseRows),
    previousStats: previousRow
      ? computeStats(previousSalaries, previousExpenses)
      : null,
    departmentBreakdown: buildBreakdown(
      groupedAmounts(salaryRows),
      groupedAmounts(previousSalaries),
    ),
    expenseBreakdown: buildBreakdown(
      groupedExpenses(expenseRows),
      groupedExpenses(previousExpenses),
    ),
  };
}
