import {
  changeSharedPassword,
  isRequestAuthenticated,
} from "../../../lib/auth";
import {
  ensureDatabase,
  getRawDb,
  loadPayrollData,
  MAIN_WORKSPACE_ID,
} from "../../../lib/database";
import {
  OTHER_EXPENSE_CATEGORY_NAME,
} from "../../../lib/expenses";
import { EMPTY_DEPARTMENT_IDS_ON_NEW_MONTH } from "../../../lib/months";
import type { SalaryComponentKind } from "../../../lib/types";

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

function optionalText(value: unknown, label: string, max = 600): string {
  const result = String(value ?? "").trim();
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

function idList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${label} таңдалмады.`);
  }
  if (value.length > 2_000) {
    throw new Error(`${label} саны 2000-нан аспауы керек.`);
  }
  return [
    ...new Set(
      value.map((item) => text(item, label, 120)),
    ),
  ];
}

function monthId(value: unknown): string {
  const result = String(value ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) {
    throw new Error("Ай форматы дұрыс емес.");
  }
  return result;
}

async function resolveMonthId(workspaceId: string, period: unknown): Promise<string> {
  const normalized = monthId(period);
  const [year, month] = normalized.split("-").map(Number);
  const row = await getRawDb()
    .prepare("SELECT id FROM months WHERE workspace_id = ? AND year = ? AND month = ?")
    .bind(workspaceId, year, month)
    .first<{ id: string }>();
  if (!row) throw new Error("Есептік ай табылмады.");
  return row.id;
}

async function resolveOtherCategoryId(workspaceId: string): Promise<string> {
  const row = await getRawDb()
    .prepare("SELECT id FROM expense_categories WHERE workspace_id = ? AND name = ? AND archived_at IS NULL")
    .bind(workspaceId, OTHER_EXPENSE_CATEGORY_NAME)
    .first<{ id: string }>();
  if (!row) throw new Error("«Басқа шығындар» категориясы табылмады.");
  return row.id;
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
      await loadPayrollData(
        url.searchParams.get("month") ?? undefined,
        url.searchParams.get("workspace") ?? undefined,
      ),
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
    const workspaceId = body.workspaceId
      ? text(body.workspaceId, "Жоба")
      : MAIN_WORKSPACE_ID;
    const workspace = await db.prepare("SELECT id FROM workspaces WHERE id = ?")
      .bind(workspaceId).first<{ id: string }>();
    if (!workspace) throw new Error("Жоба табылмады.");

    if (action === "createWorkspace") {
      const name = text(body.name, "Жоба атауы", 80);
      const id = crypto.randomUUID();
      const period = body.monthId ? monthId(body.monthId) : new Date().toISOString().slice(0, 7);
      const [year, month] = period.split("-").map(Number);
      const monthRecordId = crypto.randomUUID();
      const order = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM workspaces")
        .first<{ next: number }>();
      const statements = [
        db.prepare("INSERT INTO workspaces (id, name, sort_order) VALUES (?, ?, ?)").bind(id, name, order?.next ?? 1),
        db.prepare("INSERT INTO months (id, year, month, workspace_id) VALUES (?, ?, ?, ?)").bind(monthRecordId, year, month, id),
      ];
      for (const [label, sortOrder] of [
        ["Академ", 1], ["Мұғалімдер", 2], ["Маркетинг Eduser", 3],
        ["Ustaz Media", 4], ["Кураторлар", 5], ["Сату бөлімі", 6],
      ] as Array<[string, number]>) {
        statements.push(db.prepare("INSERT INTO departments (id, name, sort_order, workspace_id) VALUES (?, ?, ?, ?)")
          .bind(crypto.randomUUID(), label, sortOrder, id));
      }
      for (const [label, sortOrder] of [
        ["Аударым", 1], ["Ресми", 2], ["Ресми + ЖК", 3], ["ЖК", 4],
        ["Өзін-өзі жұмыспен қамтыған", 5],
      ] as Array<[string, number]>) {
        statements.push(db.prepare("INSERT INTO payment_methods (id, name, sort_order, is_system, workspace_id) VALUES (?, ?, ?, 1, ?)")
          .bind(crypto.randomUUID(), label, sortOrder, id));
      }
      for (const [label, sortOrder] of [
        ["Ғимарат арендасы", 1], ["Интернет", 2], ["Техникалық сервистер", 3],
        ["Подписка", 4], [OTHER_EXPENSE_CATEGORY_NAME, 5],
      ] as Array<[string, number]>) {
        statements.push(db.prepare("INSERT INTO expense_categories (id, name, sort_order, workspace_id) VALUES (?, ?, ?, ?)")
          .bind(crypto.randomUUID(), label, sortOrder, id));
      }
      await db.batch(statements);
      return Response.json(await loadPayrollData(period, id));
    }

    if (action === "createMonth") {
      const targetPeriod = monthId(body.newMonthId);
      const sourcePeriod = monthId(body.sourceMonthId ?? body.monthId);
      const sourceId = await resolveMonthId(workspaceId, sourcePeriod);
      const [year, month] = targetPeriod.split("-").map(Number);
      const exists = await db
        .prepare("SELECT id FROM months WHERE workspace_id = ? AND year = ? AND month = ?")
        .bind(workspaceId, year, month)
        .first();
      if (exists) throw new Error("Бұл ай бұрыннан бар.");
      const targetId = crypto.randomUUID();
      const copyRecurringExpenses =
        body.copyRecurringExpenses === undefined
          ? true
          : flag(body.copyRecurringExpenses);

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
             WHERE e.workspace_id = ? AND e.archived_at IS NULL AND d.archived_at IS NULL
               AND e.department_id NOT IN (?, ?)
               AND d.name NOT IN ('Кураторлар', 'Сату бөлімі')
             ORDER BY d.sort_order, e.full_name`,
          )
          .bind(sourceId, workspaceId, ...EMPTY_DEPARTMENT_IDS_ON_NEW_MONTH)
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
      const recurringExpenses = copyRecurringExpenses
        ? (
            await db
              .prepare(
                `SELECT category_id, category_name, name, department_id, department_name, amount
                  FROM expenses WHERE month_id = ? AND is_recurring = 1`,
              )
              .bind(sourceId)
              .all<{
                category_id: string;
                 category_name: string;
                 name: string;
                 department_id: string | null;
                 department_name: string | null;
                 amount: number;
              }>()
          ).results
        : [];
      const statements = [
        db
          .prepare(
            "INSERT INTO months (id, year, month, source_month_id, workspace_id) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(targetId, year, month, sourceId, workspaceId),
      ];
      for (const employee of employees) {
        const snapshotId = crypto.randomUUID();
        statements.push(
          db
            .prepare(
              `INSERT INTO salary_snapshots
               (id, month_id, employee_id, department_id, employee_name, position, department_name,
                payment_method_id, payment_method_name, base_salary, workspace_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              workspaceId,
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
               (id, month_id, category_id, category_name, name, department_id,
                department_name, amount, is_recurring, workspace_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              targetId,
              expense.category_id,
              expense.category_name,
              expense.name,
              expense.department_id,
              expense.department_name,
              expense.amount,
              workspaceId,
            ),
        );
      }
      await db.batch(statements);
      return Response.json(await loadPayrollData(targetPeriod, workspaceId));
    }

    if (action === "resetMonthPayments") {
      const targetPeriod = monthId(body.targetMonthId);
      const selectedPeriod = monthId(body.monthId);
      const targetId = await resolveMonthId(workspaceId, targetPeriod);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);

      await db.batch([
        db
          .prepare(
            `UPDATE salary_snapshots
             SET is_paid = 0, paid_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE month_id = ?`,
          )
          .bind(targetId),
        db
          .prepare(
            `UPDATE expenses
             SET is_paid = 0, paid_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE month_id = ?
               AND (category_id <> ? OR is_recurring <> 0)`,
          )
          .bind(targetId, otherCategoryId),
      ]);

      return Response.json(await loadPayrollData(selectedPeriod, workspaceId));
    }

    if (action === "deleteMonth") {
      const targetPeriod = monthId(body.targetMonthId);
      const selectedPeriod = monthId(body.monthId);
      const targetId = await resolveMonthId(workspaceId, targetPeriod);

      const monthCount = await db
        .prepare("SELECT COUNT(*) AS count FROM months WHERE workspace_id = ?")
        .bind(workspaceId)
        .first<{ count: number | string }>();
      if (Number(monthCount?.count ?? 0) <= 1) {
        throw new Error("Соңғы есептік айды өшіруге болмайды.");
      }

      await db.batch([
        db
          .prepare(
            `DELETE FROM salary_components
             WHERE salary_snapshot_id IN (
               SELECT id FROM salary_snapshots WHERE month_id = ?
             )`,
          )
          .bind(targetId),
        db
          .prepare("DELETE FROM salary_snapshots WHERE month_id = ?")
          .bind(targetId),
        db
          .prepare("DELETE FROM expenses WHERE month_id = ?")
          .bind(targetId),
        db
          .prepare(
            `UPDATE months
             SET source_month_id = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE source_month_id = ?`,
          )
          .bind(targetId),
        db.prepare("DELETE FROM months WHERE id = ?").bind(targetId),
      ]);

      return Response.json(
        await loadPayrollData(selectedPeriod === targetPeriod ? undefined : selectedPeriod, workspaceId),
      );
    }

    if (action === "toggleSalaryPaid") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const id = text(body.id, "Айлық");
      const paid = flag(body.isPaid);
      await db
        .prepare(
          `UPDATE salary_snapshots
           SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND month_id = ?`,
        )
        .bind(
          paid ? 1 : 0,
          paid ? new Date().toISOString() : null,
          id,
          selectedMonth,
        )
        .run();
      return Response.json({
        ok: true,
        compact: true,
        action,
        id,
        isPaid: paid,
      });
    } else if (action === "setSalaryPaidBulk") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const salaryIds = idList(body.ids, "Айлық");
      const paid = flag(body.isPaid);
      const placeholders = salaryIds.map(() => "?").join(", ");
      await db
        .prepare(
          `UPDATE salary_snapshots
           SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE month_id = ? AND id IN (${placeholders})`,
        )
        .bind(
          paid ? 1 : 0,
          paid ? new Date().toISOString() : null,
          selectedMonth,
          ...salaryIds,
        )
        .run();
    } else if (action === "toggleExpensePaid") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      const id = text(body.id, "Шығын");
      const paid = flag(body.isPaid);
      const current = await db
        .prepare(
          `SELECT category_id, is_recurring
           FROM expenses WHERE id = ? AND month_id = ?`,
        )
        .bind(id, selectedMonth)
        .first<{ category_id: string; is_recurring: number }>();
      if (!current) throw new Error("Шығын табылмады.");
      if (
        current.category_id === otherCategoryId &&
        current.is_recurring === 0
      ) {
        throw new Error(
          "«Басқа шығындар» реестріндегі ақша жұмсалған болып есептеледі.",
        );
      }
      await db
        .prepare(
          `UPDATE expenses SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND month_id = ?`,
        )
        .bind(
          paid ? 1 : 0,
          paid ? new Date().toISOString() : null,
          id,
          selectedMonth,
        )
        .run();
      return Response.json({
        ok: true,
        compact: true,
        action,
        id,
        isPaid: paid,
      });
    } else if (action === "setExpensePaidBulk") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      const expenseIds = idList(body.ids, "Шығын");
      const paid = flag(body.isPaid);
      const placeholders = expenseIds.map(() => "?").join(", ");
      await db
        .prepare(
          `UPDATE expenses
           SET is_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE month_id = ? AND id IN (${placeholders})
             AND (category_id <> ? OR is_recurring <> 0)`,
        )
        .bind(
          paid ? 1 : 0,
          paid ? new Date().toISOString() : null,
          selectedMonth,
          ...expenseIds,
          otherCategoryId,
        )
        .run();
    } else if (action === "deleteExpensesBulk") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      const expenseIds = idList(body.ids, "Шығын");
      const placeholders = expenseIds.map(() => "?").join(", ");
      await db
        .prepare(
          `DELETE FROM expenses
           WHERE month_id = ? AND id IN (${placeholders})
             AND (category_id <> ? OR is_recurring <> 0)`,
        )
        .bind(
          selectedMonth,
          ...expenseIds,
          otherCategoryId,
        )
        .run();
    } else if (action === "saveEmployeeNote") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const snapshotId = text(body.id, "Айлық жазбасы");
      const note = optionalText(body.note, "Пікір");
      const result = await db
        .prepare(
          `UPDATE salary_snapshots
           SET note = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND month_id = ?`,
        )
        .bind(note, snapshotId, selectedMonth)
        .run();
      if (!result.meta.changes) {
        throw new Error("Қызметкердің айлық жазбасы табылмады.");
      }
      return Response.json({
        ok: true,
        compact: true,
        action,
        id: snapshotId,
        note,
      });
    } else if (action === "saveEmployee") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const employeeId = body.employeeId
        ? text(body.employeeId, "Қызметкер")
        : crypto.randomUUID();
      const fullName = text(body.fullName, "Қызметкер аты");
      const position = String(body.position ?? "").trim().slice(0, 120);
      const departmentId = text(body.departmentId, "Бөлім");
      const paymentMethodId = text(body.paymentMethodId, "Төлем түрі");
      const baseSalary = money(body.baseSalary, "Негізгі айлық");
      const note = optionalText(body.note, "Пікір");
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
               (id, full_name, position, department_id, payment_method_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(employeeId, fullName, position, departmentId, paymentMethodId, workspaceId),
        );
      }
      const snapshotId = currentSnapshot?.id ?? crypto.randomUUID();
      if (currentSnapshot) {
        statements.push(
          db
            .prepare(
              `UPDATE salary_snapshots
               SET employee_name = ?, position = ?, department_id = ?, department_name = ?,
                   payment_method_id = ?, payment_method_name = ?, base_salary = ?, note = ?,
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
              note,
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
                payment_method_id, payment_method_name, base_salary, note, workspace_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              note,
              workspaceId,
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
    } else if (action === "deleteEmployee") {
      const id = text(body.employeeId, "Қызметкер");
      await db.batch([
        db
          .prepare(
            `DELETE FROM salary_components
             WHERE salary_snapshot_id IN (
               SELECT id FROM salary_snapshots WHERE employee_id = ?
             )`,
          )
          .bind(id),
        db
          .prepare("DELETE FROM salary_snapshots WHERE employee_id = ?")
          .bind(id),
        db.prepare("DELETE FROM employees WHERE id = ?").bind(id),
      ]);
    } else if (action === "deleteEmployeesBulk") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const requestedIds = idList(body.employeeIds, "Қызметкер");
      const requestedPlaceholders = requestedIds.map(() => "?").join(", ");
      const matched = (
        await db
          .prepare(
            `SELECT DISTINCT employee_id
             FROM salary_snapshots
             WHERE month_id = ? AND employee_id IN (${requestedPlaceholders})`,
          )
          .bind(selectedMonth, ...requestedIds)
          .all<{ employee_id: string }>()
      ).results;
      const employeeIds = matched.map((employee) => employee.employee_id);
      if (!employeeIds.length) {
        throw new Error("Өшірілетін қызметкерлер табылмады.");
      }
      const placeholders = employeeIds.map(() => "?").join(", ");
      await db.batch([
        db
          .prepare(
            `DELETE FROM salary_components
             WHERE salary_snapshot_id IN (
               SELECT id FROM salary_snapshots
               WHERE employee_id IN (${placeholders})
             )`,
          )
          .bind(...employeeIds),
        db
          .prepare(
            `DELETE FROM salary_snapshots
             WHERE employee_id IN (${placeholders})`,
          )
          .bind(...employeeIds),
        db
          .prepare(
            `DELETE FROM employees WHERE id IN (${placeholders})`,
          )
          .bind(...employeeIds),
      ]);
    } else if (action === "saveOneTimeExpense") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const id = body.id ? text(body.id, "Шығын") : crypto.randomUUID();
      const name = text(body.name, "Шығын атауы");
      const amount = money(body.amount, "Шығын сомасы");
      if (amount <= 0) throw new Error("Шығын сомасы 0 ₸-ден жоғары болуы керек.");
      const category = { id: await resolveOtherCategoryId(workspaceId) };

      if (body.id) {
        const current = await db
          .prepare(
            `SELECT amount FROM expenses
             WHERE id = ? AND month_id = ? AND category_id = ? AND is_recurring = 0`,
          )
          .bind(id, selectedMonth, category.id)
          .first<{ amount: number }>();
        if (!current) throw new Error("Бір реттік шығын табылмады.");
        await db
          .prepare(
            `UPDATE expenses
             SET category_id = ?, category_name = ?, name = ?, amount = ?,
                 is_recurring = 0,
                 is_paid = 1,
                 paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND month_id = ?`,
          )
          .bind(
            category.id,
            OTHER_EXPENSE_CATEGORY_NAME,
            name,
            amount,
            id,
            selectedMonth,
          )
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO expenses
             (id, month_id, category_id, category_name, name, amount,
              is_recurring, is_paid, paid_at, workspace_id)
             VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP, ?)`,
          )
          .bind(
            id,
            selectedMonth,
            category.id,
            OTHER_EXPENSE_CATEGORY_NAME,
            name,
            amount,
            workspaceId,
          )
          .run();
      }
    } else if (action === "saveExpense") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      const id = body.id ? text(body.id, "Шығын") : crypto.randomUUID();
      const name = text(body.name, "Шығын атауы");
      const categoryId = text(body.categoryId, "Категория");
      const amount = money(body.amount, "Шығын сомасы");
      const recurring = flag(body.isRecurring);
      if (
        categoryId === otherCategoryId &&
        !recurring &&
        !body.id
      ) {
        throw new Error(
          "Бір реттік шығынды «Басқа шығындар» реестрінен қосыңыз.",
        );
      }
      const category = await db
        .prepare(
          `SELECT name FROM expense_categories
           WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`,
        )
        .bind(categoryId, workspaceId)
        .first<{ name: string }>();
      if (!category) throw new Error("Шығын категориясы табылмады.");
      const isSubscription = category.name.toLocaleLowerCase("kk-KZ").includes("подпис");
      const departmentId = body.departmentId
        ? text(body.departmentId, "Бөлім")
        : null;
      let departmentName: string | null = null;
      if (departmentId) {
        const department = await db
          .prepare(
            `SELECT name FROM departments
             WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`,
          )
          .bind(departmentId, workspaceId)
          .first<{ name: string }>();
        if (!department) throw new Error("Шығын бөлімі табылмады.");
        departmentName = department.name;
      }
      if (isSubscription && !departmentId) {
        throw new Error("Подписка қай бөлімге тиесілі екенін таңдаңыз.");
      }
      if (body.id) {
        const current = await db
          .prepare(
            `SELECT amount, category_id, is_recurring
             FROM expenses WHERE id = ? AND month_id = ?`,
          )
          .bind(id, selectedMonth)
          .first<{
            amount: number;
            category_id: string;
            is_recurring: number;
          }>();
        if (!current) throw new Error("Шығын табылмады.");
        if (
          current.category_id === otherCategoryId &&
          current.is_recurring === 0
        ) {
          throw new Error(
            "Бір реттік шығынды «Басқа шығындар» реестрінен өзгертіңіз.",
          );
        }
        await db
          .prepare(
            `UPDATE expenses SET category_id = ?, category_name = ?, name = ?,
             department_id = ?, department_name = ?, amount = ?,
             is_recurring = ?, is_paid = CASE WHEN amount <> ? THEN 0 ELSE is_paid END,
             paid_at = CASE WHEN amount <> ? THEN NULL ELSE paid_at END,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND month_id = ?`,
          )
          .bind(
            categoryId,
            category.name,
            name,
            departmentId,
            departmentName,
            amount,
            recurring ? 1 : 0,
            amount,
            amount,
            id,
            selectedMonth,
          )
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO expenses
             (id, month_id, category_id, category_name, name, department_id,
              department_name, amount, is_recurring, workspace_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            selectedMonth,
            categoryId,
            category.name,
            name,
            departmentId,
            departmentName,
            amount,
            recurring ? 1 : 0,
            workspaceId,
          )
          .run();
      }
    } else if (action === "deleteExpense") {
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      await db
        .prepare("DELETE FROM expenses WHERE id = ? AND month_id = ?")
        .bind(text(body.id, "Шығын"), selectedMonth)
        .run();
    } else if (action === "saveDepartment") {
      const id = body.id ? text(body.id, "Бөлім") : crypto.randomUUID();
      const name = text(body.name, "Бөлім атауы");
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
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
          .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM departments WHERE workspace_id = ?")
          .bind(workspaceId)
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO departments (id, name, sort_order, workspace_id) VALUES (?, ?, ?, ?)",
          )
          .bind(id, name, order?.next ?? 1, workspaceId)
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
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
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
          .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM payment_methods WHERE workspace_id = ?")
          .bind(workspaceId)
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO payment_methods (id, name, sort_order, is_system, workspace_id) VALUES (?, ?, ?, 0, ?)",
          )
          .bind(id, name, order?.next ?? 1, workspaceId)
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
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      if (body.id && id === otherCategoryId) {
        throw new Error("«Басқа шығындар» — жүйелік категория және өзгертілмейді.");
      }
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
            "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM expense_categories WHERE workspace_id = ?",
          )
          .bind(workspaceId)
          .first<{ next: number }>();
        await db
          .prepare(
            "INSERT INTO expense_categories (id, name, sort_order, workspace_id) VALUES (?, ?, ?, ?)",
          )
          .bind(id, name, order?.next ?? 1, workspaceId)
          .run();
      }
    } else if (action === "archiveExpenseCategory") {
      const id = text(body.id, "Категория");
      const otherCategoryId = await resolveOtherCategoryId(workspaceId);
      if (id === otherCategoryId) {
        throw new Error("«Басқа шығындар» жүйелік категориясын архивтеуге болмайды.");
      }
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
      const selectedMonth = await resolveMonthId(workspaceId, body.monthId);
      if (!Array.isArray(body.rows) || !body.rows.length) {
        throw new Error("Импорт жолдары табылмады.");
      }
      if (body.rows.length > 2_000) throw new Error("Бір импортта 2000 жолдан артық болмауы керек.");
      const departmentRows = (
        await db
          .prepare("SELECT id, name FROM departments WHERE workspace_id = ? AND archived_at IS NULL")
          .bind(workspaceId)
          .all<{ id: string; name: string }>()
      ).results;
      const methodRows = (
        await db
          .prepare("SELECT id, name FROM payment_methods WHERE workspace_id = ? AND archived_at IS NULL")
          .bind(workspaceId)
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
      const reusableEmployees = (
        await db
          .prepare(
            `SELECT id, LOWER(full_name) AS name, department_id
             FROM employees WHERE workspace_id = ? AND archived_at IS NULL`,
          )
          .bind(workspaceId)
          .all<{ id: string; name: string; department_id: string }>()
      ).results;
      const reusableEmployeeMap = new Map(
        reusableEmployees.map((employee) => [
          `${employee.department_id}:${employee.name}`,
          employee.id,
        ]),
      );
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
        const importedComponents = Array.isArray(row.components)
          ? components(row.components)
          : row.ps
            ? [
                {
                  name: "ПС",
                  kind: "addition" as const,
                  amount: money(row.ps, "ПС"),
                },
              ]
            : [];
        if (importedComponents.length > 100) {
          throw new Error(`${fullName}: қосымша сома саны тым көп.`);
        }
        const importedBaseSalary = money(row.baseSalary, "Негізгі айлық");
        const importedSalary = importedComponents.reduce(
          (total, component) =>
            total +
            (component.kind === "deduction"
              ? -component.amount
              : component.amount),
          importedBaseSalary,
        );
        if (importedSalary < 0) {
          throw new Error(`${fullName}: негізгі айлық дұрыс емес.`);
        }
        const employeeId =
          reusableEmployeeMap.get(duplicateKey) ?? crypto.randomUUID();
        const snapshotId = crypto.randomUUID();
        if (!reusableEmployeeMap.has(duplicateKey)) {
          statements.push(
            db
              .prepare(
                "INSERT INTO employees (id, full_name, position, department_id, payment_method_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .bind(employeeId, fullName, position, department.id, method.id, workspaceId),
          );
          reusableEmployeeMap.set(duplicateKey, employeeId);
        } else {
          statements.push(
            db
              .prepare(
                `UPDATE employees
                 SET full_name = ?, position = ?, payment_method_id = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
              )
              .bind(fullName, position, method.id, employeeId),
          );
        }
        statements.push(
          db
            .prepare(
              `INSERT INTO salary_snapshots
               (id, month_id, employee_id, department_id, employee_name, position, department_name,
                payment_method_id, payment_method_name, base_salary, is_paid, paid_at, workspace_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              importedSalary,
              flag(row.isPaid) ? 1 : 0,
              flag(row.isPaid) ? new Date().toISOString() : null,
              workspaceId,
            ),
        );
      }
      await db.batch(statements);
    } else {
      throw new Error("Белгісіз әрекет.");
    }

    return Response.json(await loadPayrollData(
      body.monthId ? monthId(body.monthId) : undefined,
      workspaceId,
    ));
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
