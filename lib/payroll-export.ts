import type { PayrollData, SalaryRecord } from "./types";
import type { Cell, Columns, SheetData } from "write-excel-file";

export type PayrollStatementEmployee = {
  index: number;
  departmentId: string;
  departmentName: string;
  employeeName: string;
  position: string;
  paymentMethodName: string;
  baseSalary: number;
  additions: number;
  deductions: number;
  payableAmount: number;
  isPaid: boolean;
  note: string;
};

export type PayrollStatementDepartment = {
  id: string;
  name: string;
  employees: PayrollStatementEmployee[];
  payableAmount: number;
};

export type PayrollStatement = {
  workspaceName: string;
  monthId: string;
  monthLabel: string;
  departments: PayrollStatementDepartment[];
  employees: PayrollStatementEmployee[];
  employeeCount: number;
  payableAmount: number;
};

function componentAmount(employee: SalaryRecord, kind: "addition" | "deduction") {
  return employee.components
    .filter((component) => component.kind === kind)
    .reduce((sum, component) => sum + Math.round(component.amount), 0);
}

export function buildPayrollStatement(
  data: PayrollData,
  departmentIds: Iterable<string>,
): PayrollStatement {
  const selected = new Set(departmentIds);
  let index = 0;
  const departments = data.departments
    .filter((department) => !department.archivedAt && selected.has(department.id))
    .map((department) => {
      const employees = department.employees.map((employee) => ({
        index: ++index,
        departmentId: department.id,
        departmentName: department.name,
        employeeName: employee.employeeName,
        position: employee.position,
        paymentMethodName: employee.paymentMethodName,
        baseSalary: employee.baseSalary,
        additions: componentAmount(employee, "addition"),
        deductions: componentAmount(employee, "deduction"),
        payableAmount: employee.total,
        isPaid: employee.isPaid,
        note: employee.note,
      }));

      return {
        id: department.id,
        name: department.name,
        employees,
        payableAmount: employees.reduce((sum, employee) => sum + employee.payableAmount, 0),
      };
    });
  const employees = departments.flatMap((department) => department.employees);

  return {
    workspaceName: data.selectedWorkspace.name,
    monthId: data.selectedMonth.id,
    monthLabel: data.selectedMonth.label,
    departments,
    employees,
    employeeCount: employees.length,
    payableAmount: employees.reduce((sum, employee) => sum + employee.payableAmount, 0),
  };
}

export function payrollStatementFileName(statement: PayrollStatement) {
  const safeWorkspace = statement.workspaceName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
  return `${safeWorkspace || "Айлық"}-${statement.monthId}-төлем-ведомосы.xlsx`;
}

export function buildPayrollStatementSheet(statement: PayrollStatement): {
  rows: SheetData;
  columns: Columns;
} {
  const cellBorder = { borderColor: "#000000", borderStyle: "thin" as const };
  const textCell = (value: string | number): Cell => ({ value, ...cellBorder });
  const moneyCell = (value: number): Cell => ({
    type: Number,
    value,
    format: '#,##0" ₸"',
    align: "right",
    ...cellBorder,
  });
  const rows: SheetData = [[
    textCell("№"),
    textCell("Бөлім"),
    textCell("Қызметкер"),
    textCell("Лауазымы"),
    textCell("Төлем түрі"),
    textCell("Негізгі айлық"),
    textCell("Қосымша"),
    textCell("Ұсталым"),
    textCell("Нақты төленетін сома"),
    textCell("Статус"),
    textCell("Пікір"),
  ]];

  for (const employee of statement.employees) {
    rows.push([
      { value: employee.index, type: Number, ...cellBorder },
      textCell(employee.departmentName),
      textCell(employee.employeeName),
      textCell(employee.position || "—"),
      textCell(employee.paymentMethodName),
      moneyCell(employee.baseSalary),
      moneyCell(employee.additions),
      moneyCell(employee.deductions),
      moneyCell(employee.payableAmount),
      textCell(employee.isPaid ? "Төленді" : "Төленбеді"),
      textCell(employee.note || ""),
    ]);
  }

  rows.push([
    textCell("ЖАЛПЫ"),
    textCell(""),
    textCell(""),
    textCell(""),
    textCell(""),
    textCell(""),
    textCell(""),
    textCell(""),
    moneyCell(statement.payableAmount),
    textCell(`${statement.employeeCount} қызметкер`),
    textCell(""),
  ]);

  return {
    rows,
    columns: [
      { width: 5 }, { width: 20 }, { width: 28 }, { width: 24 }, { width: 19 },
      { width: 17 }, { width: 15 }, { width: 15 }, { width: 22 }, { width: 15 }, { width: 30 },
    ],
  };
}
