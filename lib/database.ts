import { buildBreakdown, computeStats, monthLabel, salaryTotal } from "./calculations";
import { PostgresDatabase } from "./postgres-database";
import type {
  ExpenseRecord,
  PayrollData,
  SalaryComponent,
  SalaryRecord,
} from "./types";

type RuntimeEnv = {
  DATABASE_URL?: string;
  APP_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};

let initialization: Promise<void> | null = null;
let database: PostgresDatabase | null = null;

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
  const statements = [
    `CREATE TABLE IF NOT EXISTS months (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      source_month_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS months_year_month_idx ON months(year, month)`,
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

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthId = `${year}-${String(month).padStart(2, "0")}`;

  const seedStatements = [
    db
      .prepare(
        `INSERT INTO months (id, year, month)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM months)
         ON CONFLICT DO NOTHING`,
      )
      .bind(monthId, year, month),
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
      ["expense-other", "Басқа", 5],
    ].map(([id, name, order]) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO expense_categories (id, name, sort_order) VALUES (?, ?, ?)",
        )
        .bind(id, name, order),
    ),
    db
      .prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_version', '1')"),
  ];
  await db.batch(seedStatements);
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureDatabase();
  const row = await getRawDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
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
  is_paid: number;
  paid_at: string | null;
  archived_at: string | null;
};

type ComponentRow = {
  id: string;
  salary_snapshot_id: string;
  name: string;
  kind: "addition" | "deduction";
  amount: number;
};

async function loadSalaries(monthId: string): Promise<SalaryRecord[]> {
  const rows = await queryAll<SalaryRow>(
    `SELECT s.id, s.employee_id, s.employee_name, s.position, s.department_id, s.department_name,
            s.payment_method_id, s.payment_method_name, s.base_salary, s.is_paid,
            s.paid_at, e.archived_at
     FROM salary_snapshots s
     LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.month_id = ?
     ORDER BY s.department_name, s.employee_name`,
    monthId,
  );
  const components = await queryAll<ComponentRow>(
    `SELECT c.id, c.salary_snapshot_id, c.name, c.kind, c.amount
     FROM salary_components c
     JOIN salary_snapshots s ON s.id = c.salary_snapshot_id
     WHERE s.month_id = ?
     ORDER BY c.created_at, c.id`,
    monthId,
  );
  const bySnapshot = new Map<string, SalaryComponent[]>();
  for (const component of components) {
    const list = bySnapshot.get(component.salary_snapshot_id) ?? [];
    list.push({
      id: component.id,
      name: component.name,
      kind: component.kind,
      amount: component.amount,
    });
    bySnapshot.set(component.salary_snapshot_id, list);
  }
  return rows.map((row) => {
    const salaryComponents = bySnapshot.get(row.id) ?? [];
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      position: row.position,
      departmentId: row.department_id,
      departmentName: row.department_name,
      paymentMethodId: row.payment_method_id,
      paymentMethodName: row.payment_method_name,
      baseSalary: row.base_salary,
      components: salaryComponents,
      total: salaryTotal(row.base_salary, salaryComponents),
      isPaid: Boolean(row.is_paid),
      paidAt: row.paid_at,
      archivedAt: row.archived_at,
    };
  });
}

async function loadExpenses(monthId: string): Promise<ExpenseRecord[]> {
  const rows = await queryAll<{
    id: string;
    category_id: string;
    category_name: string;
    name: string;
    amount: number;
    is_recurring: number;
    is_paid: number;
    paid_at: string | null;
  }>(
    `SELECT id, category_id, category_name, name, amount, is_recurring, is_paid, paid_at
     FROM expenses WHERE month_id = ? ORDER BY category_name, name`,
    monthId,
  );
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    amount: row.amount,
    isRecurring: Boolean(row.is_recurring),
    isPaid: Boolean(row.is_paid),
    paidAt: row.paid_at,
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

export async function loadPayrollData(requestedMonthId?: string): Promise<PayrollData> {
  await ensureDatabase();
  const monthRows = await queryAll<{ id: string; year: number; month: number }>(
    "SELECT id, year, month FROM months ORDER BY year DESC, month DESC",
  );
  const selectedIndex = Math.max(
    0,
    monthRows.findIndex((month) => month.id === requestedMonthId),
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
      }>("SELECT id, name, sort_order, archived_at FROM departments ORDER BY sort_order, name"),
      queryAll<{
        id: string;
        name: string;
        sort_order: number;
        is_system: number;
        archived_at: string | null;
      }>(
        "SELECT id, name, sort_order, is_system, archived_at FROM payment_methods ORDER BY sort_order, name",
      ),
      queryAll<{
        id: string;
        name: string;
        sort_order: number;
        archived_at: string | null;
      }>(
        "SELECT id, name, sort_order, archived_at FROM expense_categories ORDER BY sort_order, name",
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
    months: monthRows.map((month) => ({
      ...month,
      label: monthLabel(month.year, month.month),
    })),
    selectedMonth: {
      ...selectedRow,
      label: monthLabel(selectedRow.year, selectedRow.month),
    },
    previousMonth: previousRow
      ? {
          id: previousRow.id,
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
