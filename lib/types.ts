export type SalaryComponentKind = "addition" | "deduction";

export type SalaryComponent = {
  id: string;
  name: string;
  kind: SalaryComponentKind;
  amount: number;
};

export type SalaryRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  departmentId: string;
  departmentName: string;
  paymentMethodId: string;
  paymentMethodName: string;
  baseSalary: number;
  note: string;
  components: SalaryComponent[];
  total: number;
  isPaid: boolean;
  paidAt: string | null;
  archivedAt: string | null;
};

export type ExpenseRecord = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  amount: number;
  isRecurring: boolean;
  isPaid: boolean;
  paidAt: string | null;
  isOneTime: boolean;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  initials: string;
};

export type DashboardStats = {
  salaryTotal: number;
  expenseTotal: number;
  plannedTotal: number;
  paidTotal: number;
  remainingTotal: number;
  paidEmployees: number;
  employeeCount: number;
  paymentProgress: number;
};

export type BreakdownItem = {
  id: string;
  name: string;
  amount: number;
  previousAmount: number;
  change: number;
  changePercent: number | null;
};

export type PayrollData = {
  workspaces: WorkspaceSummary[];
  selectedWorkspace: WorkspaceSummary;
  months: Array<{ id: string; year: number; month: number; label: string }>;
  selectedMonth: { id: string; year: number; month: number; label: string };
  previousMonth: { id: string; label: string } | null;
  departments: Array<{
    id: string;
    name: string;
    sortOrder: number;
    archivedAt: string | null;
    employees: SalaryRecord[];
    total: number;
    paid: number;
    remaining: number;
  }>;
  salaries: SalaryRecord[];
  expenses: ExpenseRecord[];
  paymentMethods: Array<{
    id: string;
    name: string;
    sortOrder: number;
    isSystem: boolean;
    archivedAt: string | null;
  }>;
  expenseCategories: Array<{
    id: string;
    name: string;
    sortOrder: number;
    archivedAt: string | null;
    isOtherExpense: boolean;
  }>;
  stats: DashboardStats;
  previousStats: DashboardStats | null;
  departmentBreakdown: BreakdownItem[];
  expenseBreakdown: BreakdownItem[];
};
