import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const months = sqliteTable(
  "months",
  {
    id: text("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    sourceMonthId: text("source_month_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("months_year_month_idx").on(table.year, table.month)],
);

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
  ...timestamps,
});

export const paymentMethods = sqliteTable("payment_methods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  ...timestamps,
});

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  departmentId: text("department_id").notNull(),
  paymentMethodId: text("payment_method_id").notNull(),
  archivedAt: text("archived_at"),
  ...timestamps,
});

export const salarySnapshots = sqliteTable(
  "salary_snapshots",
  {
    id: text("id").primaryKey(),
    monthId: text("month_id").notNull(),
    employeeId: text("employee_id").notNull(),
    departmentId: text("department_id").notNull(),
    employeeName: text("employee_name").notNull(),
    departmentName: text("department_name").notNull(),
    paymentMethodId: text("payment_method_id").notNull(),
    paymentMethodName: text("payment_method_name").notNull(),
    baseSalary: integer("base_salary").notNull().default(0),
    isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
    paidAt: text("paid_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("salary_month_employee_idx").on(table.monthId, table.employeeId),
  ],
);

export const salaryComponents = sqliteTable("salary_components", {
  id: text("id").primaryKey(),
  salarySnapshotId: text("salary_snapshot_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["addition", "deduction"] }).notNull(),
  amount: integer("amount").notNull().default(0),
  ...timestamps,
});

export const expenseCategories = sqliteTable("expense_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
  ...timestamps,
});

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  monthId: text("month_id").notNull(),
  categoryId: text("category_id").notNull(),
  categoryName: text("category_name").notNull(),
  name: text("name").notNull(),
  amount: integer("amount").notNull().default(0),
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(true),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
  paidAt: text("paid_at"),
  ...timestamps,
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
