import {
  changeSharedPassword,
  isRequestAuthenticated,
} from "@/lib/auth";
import {
  ensureDatabase,
  getRawDb,
  loadPayrollData,
} from "@/lib/database";
import type { SalaryComponentKind } from "@/lib/types";

type ActionBody = {
  action?: string;
  monthId?: string;
  [key: string]: unknown;
};

function text(value: unknown, label: string, max = 120): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} толтырылуы керек.`);
  if (result.length > max) throw new Error(`${label} тым ұзын.`);
  return result;
}

function money(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 2_000_000_000) {
    throw new Error(`${label} дұрыс көрсетілмеген.`);
  }
  return Math.round(result);
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function monthId(value: unknown): string {
  const result = String(value ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) {
    throw new Error("Ай форматы дұрыс емес.");
  }
  return result;
}

function components(value: unknown): Array<{
  id?: string;
  name: string;
  kind: SalaryComponentKind;
  amount: number;
}> {
  if (!Array.isArray(value)) return [];
  return value.map((component) => {
    const item = component as Record<string, unknown>;
    const kind = item.kind === "deduction" ? "deduction" : "addition";
    return {
      id: item.id ? String(item.id) : undefined,
      name: text(item.name, "Қосымша атауы", 80),
      kind,
      amount: money(item.amount, "Қосымша сома"),
    };
  });
}

async function authenticated(request: Request): Promise<Response | null> {
  if (await isRequestAuthenticated(request)) return null;
  return Response.json({ error: "Сессия аяқталды." }, { status: 401 });
}

export async function GET(request: Request) {
  const unauthorized = await authenticated(request);
  if (unauthorized) return unauthorized;
  try {
    const url = new URL(request.url);
    return Response.json(
      await loadPayrollData(url.searchParams.get("month") ?? undefined),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Деректерді жүктеу мүмкін болмады.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await authenticated(request);
  if (unauthorized) return unauthorized;

  try {
    await ensureDatabase();
    const body = (await request.json()) as ActionBody;
    const action = text(body.action, "Әрекет");
    const db = getRawDb();

    if (action === "createMonth") {
      const targetId = monthId(body.newMonthId);
      const sourceId = monthId(body.monthId);
      const exists = await db
        .prepare("SELECT id FROM months WHERE id = ?")
        .bind(targetId)
        .first();
      if (exists) throw new Error("Бұл ай бұрыннан бар.");
      const [year, month] = targetId.split("-").map(Number);
      const source = await db
        .prepare("SELECT id FROM months WHERE id = ?")
        .bind(sourceId)
        .first();
      if (!source) throw new Error("Көшірілетін ай табылмады.");

      const employees = (
        await db
          .prepare(
            `SELECT e.id, e.full_name, e.position, e.department_id, d.name AS department_name,
                    e.payment_method_id, pm.name AS payment_method_name,
                    s.id AS source_snapshot_id, COALESCE(s.base_salary, 0) AS base_salary
             FROM employees e
             JOIN departments d ON d.id = e.department_id
             JOIN payment_methods pm ON pm.id = e.payment_method_id
             LEFT JOIN salary_snapshots s ON s.employee_id = e.id AND s.month_id = ?
             WHERE e.archived_at IS NULL AND d.archived_at IS NULL
             ORDER BY d.sort_order, e.full_name`,
          )
          .bind(sourceId)
          .all<{
            id: string;
            full_name: string;
            position: string;
            department_id: string;
            department_name: string;
            payment_method_id: string;
            payment_method_name: string;
            source_snapshot_id: string | null;
            base_salary: number;
          }>()
      ).results;
      const sourceComponents = (
        await db
          .prepare(
            `SELECT c.salary_snapshot_id, c.name, c.kind, c.amount
             FROM salary_components c
             JOIN salary_snapshots s ON s.id = c.salary_snapshot_id
             WHERE s.month_id = ?`,
          )
          .bind(sourceId)
          .all<{
            salary_snapshot_id: string;
            name: string;
            kind: SalaryComponentKind;
            amount: number;
          }>()
      ).results;
      const recurringExpenses = (
        await db
          .prepare(
            `SELECT category_id, category_name, name, amount
             FROM expenses WHERE month_id = ? AND is_recurring = 1`,
          )
          .bind(sourceId)
          .all<{
            category_id: string;
            category_name: string;
            name: string;
            amount: number;
          }>()
      ).results;
      const statements = [
        db
          .prepare(
            "INSERT INTO months (id, year, month, source_month_id) VALUES (?, ?, ?, ?)",
          )
          .bind(targetId, year, month, sourceId),
      ];
      for (const employee of employees) {
        const snapshotId = crypto.randomUUID();
        statements.push(
          db
            .prepare(
              `INSERT INTO salary_snapshots
               (id, month_id, employee_id, department_id, employee_name, position, department_name,
                payment_method_id, payment_method_name, base_salary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              snapshotId,
              targetId,
              employee.id,
              employee.department_id,
              employee.full_name,
              employee.position,
              employee.department_name,
              employee.payment_method_id,
              employee.payment_method_name,
              employee.base_salary,
            ),
        );
        for (const component of sourceComponents.filter(
          (item) => item.salary_snapshot_id === employee.source_snapshot_id,
        )) {
          statements.push(
            db
              .prepare(
                `INSERT INTO salary_components
                 (id, salary_snapshot_id, name, kind, amount) VALUES (?, ?, ?, ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                snapshotId,
                component.name,
                component.kind,
                component.amount,
              ),
          );
        }
      }
      for (const expense of recurringExpenses) {
        statements.push(
          db
            .prepare(
              `INSERT INTO expenses
               (id, month_id, category_id, category_name, name, amount, is_recurring)
               VALUES (?, ?, ?, ?, ?, ?, 1)`,
            )
            .bind(
              crypto.randomUUID(),
              targetId,
              expense.category_id,
              expense.category_name,
              expense.name,
              expense.amount,
            ),
        );
      }
      await db.batch(statements);
      return Response.json(await loadPayrollData(targetId));
    }

    if (action === "toggleSalaryPaid") {
      const id = text(body.id, "Айлық");
      const paid = flag(body.isPaid);
      await db
        .prepare(
          `UPDATE salary_snapshots
           SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(paid ? 1 : 0, paid ? new Date().toISOString() : null, id)
        .run();
    } else if (action === "toggleExpensePaid") {
      const id = text(body.id, "Шығын");
      const paid = flag(body.isPaid);
      await db
        .prepare(
          `UPDATE expenses SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(paid ? 1 : 0, paid ? new Date().toISOString() : null, id)
        .run();
    } else if (action === "saveEmployee") {
      const selectedMonth = monthId(body.monthId);
      const employeeId = body.employeeId
        ? text(body.employeeId, "Қызметкер")
        : crypto.randomUUID();
      const fullName = text(body.fullName, "Қызметкер аты");
      const position = String(body.position ?? "").trim().slice(0, 120);
      const departmentId = text(body.departmentId, "Бөлім");
      const paymentMethodId = text(body.paymentMethodId, "Төлем түрі");
      const baseSalary = money(body.baseSalary, "Негізгі айлық");
      const salaryComponents = components(body.components);
      const [department, method] = await Promise.all([
        db
          .prepare("SELECT name FROM departments WHERE id = ? AND archived_at IS NULL")
          .bind(departmentId)
          .first<{ name: string }>(),
        db
          .prepare("SELECT name FROM payment_methods WHERE id = ? AND archived_at IS NULL")
          .bind(paymentMethodId)
          .first<{ name: string }>(),
      ]);
      if (!department) throw new Error("Бөлім табылмады.");
      if (!method) throw new Error("Төлем түрі табылмады.");

      const currentSnapshot = await db
        .prepare(
          "SELECT id, base_salary FROM salary_snapshots WHERE month_id = ? AND employee_id = ?",
        )
        .bind(selectedMonth, employeeId)
        .first<{ id: string; base_salary: number }>();
      const existingComponents = currentSnapshot
        ? (
            await db
              .prepare(
                "SELECT name, kind, amount FROM salary_components WHERE salary_snapshot_id = ? ORDER BY name, kind, amount",
              )
              .bind(currentSnapshot.id)
              .all<{ name: string; kind: string; amount: number }>()
          ).results
        : [];
      const nextSignature = JSON.stringify(
        salaryComponents
          .map(({ name, kind, amount }) => ({ name, kind, amount }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      );
      const oldSignature = JSON.stringify(
        existingComponents.sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
      );
      const salaryChanged =
        !currentSnapshot ||
        currentSnapshot.base_salary !== baseSalary ||
        nextSignature !== oldSignature;

      const statements = [];
      if (body.employeeId) {
        statements.push(
          db
            .prepare(
              `UPDATE employees SET full_name = ?, position = ?, department_id = ?, payment_method_id = ?,
               updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(fullName, position, departmentId, paymentMethodId, employeeId),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO employees
               (id, full_name, position, department_id, payment_method_id) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(employeeId, fullName, position, departmentId, paymentMethodId),
        );
      }
      const snapshotId = currentSnapshot?.id ?? crypto.randomUUID();
      if (currentSnapshot) {
        statements.push(
          db
            .prepare(
              `UPDATE salary_snapshots
               SET employee_name = ?, position = ?, department_id = ?, department_name = ?,
                   payment_method_id = ?, payment_method_name = ?, base_salary = ?,
                   is_paid = CASE WHEN ? THEN 0 ELSE is_paid END,
                   paid_at = CASE WHEN ? THEN NULL ELSE paid_at END,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            )
            .bind(
              fullName,
              position,
              departmentId,
              department.name,
              paymentMethodId,
              method.name,
              baseSalary,
              salaryChanged ? 1 : 0,
              salaryChanged ? 1 : 0,
              snapshotId,
            ),
        );
        statements.push(
          db
            .prepare("DELETE FROM salary_components WHERE salary_snapshot_id = ?")
            .bind(snapshotId),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO salary_snapshots
               (id, month_id, employee_id, department_id, employee_name, position, department_name,
                payment_method_id, payment_method_name, base_salary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              snapshotId,
              selectedMonth,
              employeeId,
              departmentId,
              fullName,
              position,
              department.name,
              paymentMethodId,
              method.name,
              baseSalary,
            ),
        );
      }
      for (const component of salaryComponents) {
        statements.push(
          db
            .prepare(
              `INSERT INTO salary_components
               (id, salary_snapshot_id, name, kind, amount) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(
              component.id ?? crypto.randomUUID(),
              snapshotId,
              component.name,
              component.kind,
              component.amount,
            ),
        );
      }
      await db.batch(statements);
    } else if (action === "archiveEmployee") {
      const id = text(body.employeeId, "Қызметкер");
      await db
        .prepare(
          "UPDATE employees SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(id)
        .run();
    } else if (action === "saveExpense") {
      const selectedMonth = monthId(body.monthId);
      const id = body.id ? text(body.id, "Шығын") : crypto.randomUUID();
      const name = text(body.name, "Шығын атауы");
      const categoryId = text(body.categoryId, "Категория");
      const amount = money(body.amount, "Шығын сомасы");
      const recurring = flag(body.isRecurring);
      const category = await db
        .prepare("SELECT name FROM expense_categories WHERE id = ? AND archived_at IS NULL")
        .bind(categoryId)
        .first<{ name: string }>();
      if (!category) throw new Error("Шығын категориясы табылмады.");
      if (body.id) {
        const current = await db
          .prepare("SELECT amount FROM expenses WHERE id = ?")
          .bind(id)
          .first<{ amount: number }>();
        await db
          .prepare(
            `UPDATE expenses SET category_id = ?, category_name = ?, name = ?, amount = ?,
             is_recurring = ?, is_paid = CASE WHEN amount <> ? THEN 0 ELSE is_paid END,
             paid_at = CASE WHEN amount <> ? THEN NULL ELSE paid_at END,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(
            categoryId,
            category.name,
            name,
            amount,
            recurring ? 1 : 0,
            amount,
            amount,
            id,
          )
          .run();
        if (!current) throw new Error("Шығын табылмады.");
      } else {
        await db
          .prepare(
            `INSERT INTO expenses
             (id, month_id, category_id, category_name, name, amount, is_recurring)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            selectedMonth,
            categoryId,
            category.name,
            name,
            amount,
            recurring ? 1 : 0,
          )
          .run();
      }
    } else if (action === "deleteExpense") {
      await db
        .prepare("DELETE FROM expenses WHERE id = ?")
        .bind(text(body.id, "Шығын"))
        .run();
    } else if (action === "saveDepartment") {
      const id = body.id ? text(body.id, "Бөлім") : crypto.randomUUID();
      const name = text(body.name, "Бөлім атауы");
      const selectedMonth = monthId(body.monthId);
      if (body.id) {
        await db.batch([
          db
            .prepare(
              "UPDATE departments SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name, id),
          db
            .prepare(
              `UPDATE salary_snapshots SET department_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE month_id = ? AND department_id = ?`,
            )
            .bind(name, selectedMonth, id),
        ]);
      } else {
        const order = await db
          .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM departments")
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO departments (id, name, sort_order) VALUES (?, ?, ?)",
          )
          .bind(id, name, order?.next ?? 1)
          .run();
      }
    } else if (action === "archiveDepartment") {
      const id = text(body.id, "Бөлім");
      const active = await db
        .prepare(
          "SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND archived_at IS NULL",
        )
        .bind(id)
        .first<{ count: number }>();
      if ((active?.count ?? 0) > 0) {
        throw new Error("Алдымен осы бөлімдегі қызметкерлерді архивтеңіз.");
      }
      await db
        .prepare(
          "UPDATE departments SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(id)
        .run();
    } else if (action === "savePaymentMethod") {
      const id = body.id ? text(body.id, "Төлем түрі") : crypto.randomUUID();
      const name = text(body.name, "Төлем түрі");
      const selectedMonth = monthId(body.monthId);
      if (body.id) {
        await db.batch([
          db
            .prepare(
              "UPDATE payment_methods SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name, id),
          db
            .prepare(
              `UPDATE salary_snapshots SET payment_method_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE month_id = ? AND payment_method_id = ?`,
            )
            .bind(name, selectedMonth, id),
        ]);
      } else {
        const order = await db
          .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM payment_methods")
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO payment_methods (id, name, sort_order, is_system) VALUES (?, ?, ?, 0)",
          )
          .bind(id, name, order?.next ?? 1)
          .run();
      }
    } else if (action === "archivePaymentMethod") {
      const id = text(body.id, "Төлем түрі");
      const active = await db
        .prepare(
          "SELECT COUNT(*) AS count FROM employees WHERE payment_method_id = ? AND archived_at IS NULL",
        )
        .bind(id)
        .first<{ count: number }>();
      if ((active?.count ?? 0) > 0) {
        throw new Error("Бұл төлем түрі белсенді қызметкерлерде қолданылып тұр.");
      }
      await db
        .prepare(
          "UPDATE payment_methods SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(id)
        .run();
    } else if (action === "saveExpenseCategory") {
      const id = body.id ? text(body.id, "Категория") : crypto.randomUUID();
      const name = text(body.name, "Категория атауы");
      const selectedMonth = monthId(body.monthId);
      if (body.id) {
        await db.batch([
          db
            .prepare(
              "UPDATE expense_categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name, id),
          db
            .prepare(
              `UPDATE expenses SET category_name = ?, updated_at = CURRENT_TIMESTAMP
               WHERE month_id = ? AND category_id = ?`,
            )
            .bind(name, selectedMonth, id),
        ]);
      } else {
        const order = await db
          .prepare(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM expense_categories",
          )
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO expense_categories (id, name, sort_order) VALUES (?, ?, ?)",
          )
          .bind(id, name, order?.next ?? 1)
          .run();
      }
    } else if (action === "archiveExpenseCategory") {
      const id = text(body.id, "Категория");
      await db
        .prepare(
          "UPDATE expense_categories SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(id)
        .run();
    } else if (action === "changePassword") {
      await changeSharedPassword(text(body.password, "Жаңа пароль", 200));
      return Response.json({ ok: true, signedOut: true });
    } else if (action === "importEmployees") {
      const selectedMonth = monthId(body.monthId);
      if (!Array.isArray(body.rows) || !body.rows.length) {
        throw new Error("Импорт жолдары табылмады.");
      }
      if (body.rows.length > 2_000) throw new Error("Бір импортта 2000 жолдан артық болмауы керек.");
      const departmentRows = (
        await db
          .prepare("SELECT id, name FROM departments WHERE archived_at IS NULL")
          .all<{ id: string; name: string }>()
      ).results;
      const methodRows = (
        await db
          .prepare("SELECT id, name FROM payment_methods WHERE archived_at IS NULL")
          .all<{ id: string; name: string }>()
      ).results;
      const departmentMap = new Map(
        departmentRows.map((department) => [department.name.toLocaleLowerCase("kk-KZ"), department]),
      );
      const forcedDepartment = body.departmentId
        ? departmentRows.find(
            (department) => department.id === text(body.departmentId, "Бөлім"),
          )
        : undefined;
      if (body.departmentId && !forcedDepartment) {
        throw new Error("Импорт жасалатын бөлім табылмады.");
      }
      const methodMap = new Map(
        methodRows.map((method) => [method.name.toLocaleLowerCase("kk-KZ"), method]),
      );
      const existing = (
        await db
          .prepare(
            "SELECT LOWER(employee_name) AS name, department_id FROM salary_snapshots WHERE month_id = ?",
          )
          .bind(selectedMonth)
          .all<{ name: string; department_id: string }>()
      ).results;
      const duplicateKeys = new Set(existing.map((row) => `${row.department_id}:${row.name}`));
      const statements = [];
      for (const raw of body.rows) {
        const row = raw as Record<string, unknown>;
        const departmentName =
          forcedDepartment?.name ?? text(row.department, "Бөлім");
        const fullName = text(row.fullName, "Қызметкер");
        const position = String(row.position ?? "").trim().slice(0, 120);
        const department =
          forcedDepartment ??
          departmentMap.get(departmentName.toLocaleLowerCase("kk-KZ"));
        const methodName = text(row.paymentMethod, "Төлем түрі");
        const method = methodMap.get(methodName.toLocaleLowerCase("kk-KZ"));
        if (!department) throw new Error(`Белгісіз бөлім: ${departmentName}`);
        if (!method) throw new Error(`Белгісіз төлем түрі: ${methodName}`);
        const duplicateKey = `${department.id}:${fullName.toLocaleLowerCase("kk-KZ")}`;
        if (duplicateKeys.has(duplicateKey)) {
          throw new Error(`Қайталанған қызметкер: ${fullName}`);
        }
        duplicateKeys.add(duplicateKey);
        const employeeId = crypto.randomUUID();
        const snapshotId = crypto.randomUUID();
        statements.push(
          db
            .prepare(
              "INSERT INTO employees (id, full_name, position, department_id, payment_method_id) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(employeeId, fullName, position, department.id, method.id),
          db
            .prepare(
              `INSERT INTO salary_snapshots
               (id, month_id, employee_id, department_id, employee_name, position, department_name,
                payment_method_id, payment_method_name, base_salary, is_paid, paid_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              snapshotId,
              selectedMonth,
              employeeId,
              department.id,
              fullName,
              position,
              department.name,
              method.id,
              method.name,
              money(row.baseSalary, "Негізгі айлық"),
              flag(row.isPaid) ? 1 : 0,
              flag(row.isPaid) ? new Date().toISOString() : null,
            ),
        );
        const ps = money(row.ps ?? 0, "ПС");
        if (ps > 0) {
          statements.push(
            db
              .prepare(
                `INSERT INTO salary_components
                 (id, salary_snapshot_id, name, kind, amount) VALUES (?, ?, 'ПС', 'addition', ?)`,
              )
              .bind(crypto.randomUUID(), snapshotId, ps),
          );
        }
      }
      await db.batch(statements);
    } else {
      throw new Error("Белгісіз әрекет.");
    }

    return Response.json(await loadPayrollData(body.monthId ? monthId(body.monthId) : undefined));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Әрекетті орындау мүмкін болмады.",
      },
      { status: 400 },
    );
  }
}
