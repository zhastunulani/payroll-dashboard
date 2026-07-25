"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  TriangleAlert,
  Upload,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import readExcelFile from "read-excel-file/browser";
import type {
  BreakdownItem,
  PayrollData,
  SalaryComponent,
  SalaryRecord,
} from "@/lib/types";
import { salaryTotal } from "@/lib/calculations";
import {
  isOneTimeOtherExpense,
  OTHER_EXPENSE_CATEGORY_ID,
} from "@/lib/expenses";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "@/lib/money";
import {
  nextAvailableMonthId,
  shouldCopyDepartmentToNewMonth,
} from "@/lib/months";
import {
  extractPayrollImportRow,
  parseDelimitedGrid,
  rowsFromGrid,
  selectImportSheets,
  type PayrollImportComponent,
} from "@/lib/payroll-import";

type View =
  | "dashboard"
  | "departments"
  | "expenses"
  | "other-expenses"
  | "settings";
type EntityType = "department" | "method" | "category";
type SettingsSection =
  | "months"
  | "employees"
  | "departments"
  | "methods"
  | "categories"
  | "security";

function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="amount-input">
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        maxLength={18}
        placeholder="0"
        type="text"
        value={formatMoneyInput(value)}
        onChange={(event) => onChange(parseMoneyInput(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
      />
      <b>₸</b>
    </div>
  );
}

function changePercent(current: number, previous?: number): number | null {
  if (previous === undefined) return null;
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="change neutral">Жаңа көрсеткіш</span>;
  if (value === 0) return <span className="change neutral">Өзгеріс жоқ</span>;
  const up = value > 0;
  return (
    <span className={`change ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value)}%
    </span>
  );
}

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Кіру мүмкін болмады.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Кіру мүмкін болмады.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark large">A</div>
        <span className="eyebrow">Қаржылық бақылау</span>
        <h1>Айлық дашборды</h1>
        <p>Айлық төлемдері мен операциялық шығындарды бір жерден бақылаңыз.</p>
        <form onSubmit={submit}>
          <label>
            <span>Ортақ пароль</span>
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              placeholder="Парольді енгізіңіз"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading || !password}>
            {loading ? "Тексеріліп жатыр…" : "Кіру"}
          </button>
        </form>
        <small>Деректер қорғалған және тек парольмен ашылады.</small>
      </section>
    </main>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  extraWide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  extraWide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "wide" : ""} ${extraWide ? "extra-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">{subtitle ?? "Деректерді басқару"}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Жабу">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  detail,
  change,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  detail: string;
  change: number | null;
  tone?: "primary" | "success" | "warning" | "plain";
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-top">
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{formatMoney(value)}</strong>
      <footer>
        <small>{detail}</small>
        <ChangeBadge value={change} />
      </footer>
    </article>
  );
}

function BreakdownBars({
  items,
  emptyText,
}: {
  items: BreakdownItem[];
  emptyText: string;
}) {
  const max = Math.max(...items.map((item) => item.amount), 1);
  if (!items.length) {
    return <p className="chart-empty">{emptyText}</p>;
  }
  return (
    <div className="breakdown-bars">
      {items.slice(0, 8).map((item) => (
        <div className="bar-row" key={item.id}>
          <div className="bar-label">
            <span>{item.name}</span>
            <strong>{formatMoney(item.amount)}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max(3, (item.amount / max) * 100)}%` }} />
          </div>
          <div className={`bar-change ${item.change > 0 ? "increase" : item.change < 0 ? "decrease" : ""}`}>
            {item.change === 0
              ? "Өзгеріс жоқ"
              : `${item.change > 0 ? "+" : "−"}${formatMoney(Math.abs(item.change))}`}
          </div>
        </div>
      ))}
    </div>
  );
}

type EmployeeDraft = {
  employeeId?: string;
  fullName: string;
  position: string;
  departmentId: string;
  paymentMethodId: string;
  baseSalary: number;
  components: SalaryComponent[];
};

type ExpenseDraft = {
  id?: string;
  name: string;
  categoryId: string;
  amount: number;
  isRecurring: boolean;
};

type MonthDraft = {
  sourceMonthId: string;
  targetMonthId: string;
  copyRecurringExpenses: boolean;
};

type MonthActionDraft = {
  type: "reset" | "delete";
  monthId: string;
  label: string;
};

type OneTimeExpenseDraft = {
  id?: string;
  name: string;
  amount: number;
};

type ImportRow = {
  department: string;
  fullName: string;
  position: string;
  baseSalary: number;
  components: PayrollImportComponent[];
  paymentMethod: string;
  isPaid: boolean;
  error?: string;
};

function importRowTotal(row: ImportRow): number {
  return row.components.reduce(
    (total, component) =>
      total +
      (component.kind === "deduction" ? -component.amount : component.amount),
    row.baseSalary,
  );
}

export function PayrollApp() {
  const [view, setView] = useState<View>("dashboard");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("months");
  const [data, setData] = useState<PayrollData | null>(null);
  const [month, setMonth] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [monthDraft, setMonthDraft] = useState<MonthDraft | null>(null);
  const [monthSourcePreview, setMonthSourcePreview] =
    useState<PayrollData | null>(null);
  const [monthSourceLoading, setMonthSourceLoading] = useState(false);
  const [monthActionDraft, setMonthActionDraft] =
    useState<MonthActionDraft | null>(null);
  const [monthDeleteConfirmation, setMonthDeleteConfirmation] = useState("");
  const [monthNotice, setMonthNotice] = useState("");
  const [oneTimeExpenseDraft, setOneTimeExpenseDraft] =
    useState<OneTimeExpenseDraft | null>(null);
  const [entityDraft, setEntityDraft] = useState<{
    type: EntityType;
    id?: string;
    name: string;
  } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [employeeSelectionMode, setEmployeeSelectionMode] = useState(false);
  const [selectedSalaryIds, setSelectedSalaryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expenseSelectionMode, setExpenseSelectionMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const importInput = useRef<HTMLInputElement>(null);
  const monthPicker = useRef<HTMLDivElement>(null);

  async function load(targetMonth?: string, initial = false) {
    if (!initial) {
      setLoading(true);
      setError("");
    }
    try {
      const query = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : "";
      const response = await fetch(`/api/payroll${query}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.reload();
        return;
      }
      const result = (await response.json()) as PayrollData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Деректер жүктелмеді.");
      setData(result);
      setMonth(result.selectedMonth.id);
      setEmployeeSelectionMode(false);
      setSelectedSalaryIds(new Set());
      setExpenseSelectionMode(false);
      setSelectedExpenseIds(new Set());
      setSelectedDepartment((current) => {
        if (result.departments.some((department) => department.id === current)) return current;
        return result.departments.find((department) => !department.archivedAt)?.id ?? "";
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Деректер жүктелмеді.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void load(undefined, true);
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  useEffect(() => {
    function closeMonthMenu(event: MouseEvent) {
      if (
        monthPicker.current &&
        !monthPicker.current.contains(event.target as Node)
      ) {
        setMonthMenuOpen(false);
      }
    }

    function closeMonthMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setMonthMenuOpen(false);
    }

    document.addEventListener("mousedown", closeMonthMenu);
    document.addEventListener("keydown", closeMonthMenuWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeMonthMenu);
      document.removeEventListener("keydown", closeMonthMenuWithKeyboard);
    };
  }, []);

  async function mutate(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (!data) return false;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, monthId: data.selectedMonth.id, ...payload }),
      });
      if (response.status === 401) {
        window.location.reload();
        return false;
      }
      const result = (await response.json()) as PayrollData & {
        error?: string;
        signedOut?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Әрекет орындалмады.");
      if (result.signedOut) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.reload();
        return false;
      }
      setData(result);
      setMonth(result.selectedMonth.id);
      setEmployeeDraft(null);
      setExpenseDraft(null);
      setEntityDraft(null);
      setImportRows(null);
      setMonthDraft(null);
      setMonthSourcePreview(null);
      setMonthActionDraft(null);
      setMonthDeleteConfirmation("");
      setEmployeeSelectionMode(false);
      setSelectedSalaryIds(new Set());
      setExpenseSelectionMode(false);
      setSelectedExpenseIds(new Set());
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Әрекет орындалмады.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  function changeView(nextView: View) {
    if (nextView !== "departments") {
      setEmployeeSelectionMode(false);
      setSelectedSalaryIds(new Set());
    }
    if (nextView !== "expenses") {
      setExpenseSelectionMode(false);
      setSelectedExpenseIds(new Set());
    }
    setView(nextView);
  }

  function openEmployeeSettings() {
    setSettingsSection("employees");
    changeView("settings");
  }

  const currentDepartment = data?.departments.find(
    (department) => department.id === selectedDepartment,
  );
  const monthSourceData = monthDraft
    ? monthDraft.sourceMonthId === data?.selectedMonth.id
      ? data
      : monthSourcePreview
    : data;
  const copyableEmployeeCount =
    monthSourceData?.departments
      .filter((department) =>
        shouldCopyDepartmentToNewMonth(department.id),
      )
      .reduce(
        (total, department) => total + department.employees.length,
        0,
      ) ?? 0;
  const copyableSalaryTotal =
    monthSourceData?.departments
      .filter((department) =>
        shouldCopyDepartmentToNewMonth(department.id),
      )
      .reduce((total, department) => total + department.total, 0) ?? 0;
  const sourceRecurringExpenses =
    monthSourceData?.expenses.filter((expense) => expense.isRecurring) ?? [];
  const sourceRecurringExpenseTotal = sourceRecurringExpenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );
  const filteredEmployees = useMemo(() => {
    if (!currentDepartment) return [];
    const query = search.trim().toLocaleLowerCase("kk-KZ");
    if (!query) return currentDepartment.employees;
    return currentDepartment.employees.filter(
      (employee) =>
        employee.employeeName.toLocaleLowerCase("kk-KZ").includes(query) ||
        employee.paymentMethodName.toLocaleLowerCase("kk-KZ").includes(query),
    );
  }, [currentDepartment, search]);
  const selectedEmployees = useMemo(
    () =>
      currentDepartment?.employees.filter((employee) =>
        selectedSalaryIds.has(employee.id),
      ) ?? [],
    [currentDepartment, selectedSalaryIds],
  );
  const allEmployeesSelected =
    Boolean(currentDepartment?.employees.length) &&
    currentDepartment?.employees.every((employee) =>
      selectedSalaryIds.has(employee.id),
    );
  const selectableExpenses = useMemo(
    () =>
      data?.expenses.filter(
        (expense) => !isOneTimeOtherExpense(expense),
      ) ?? [],
    [data],
  );
  const selectedExpenses = useMemo(
    () =>
      selectableExpenses.filter((expense) =>
        selectedExpenseIds.has(expense.id),
      ),
    [selectableExpenses, selectedExpenseIds],
  );
  const allExpensesSelected =
    Boolean(selectableExpenses.length) &&
    selectableExpenses.every((expense) =>
      selectedExpenseIds.has(expense.id),
    );

  function toggleEmployeeSelection(snapshotId: string) {
    setSelectedSalaryIds((current) => {
      const next = new Set(current);
      if (next.has(snapshotId)) next.delete(snapshotId);
      else next.add(snapshotId);
      return next;
    });
  }

  function toggleAllEmployees() {
    if (!currentDepartment) return;
    setEmployeeSelectionMode(true);
    setSelectedSalaryIds(
      allEmployeesSelected
        ? new Set()
        : new Set(
            currentDepartment.employees.map((employee) => employee.id),
          ),
    );
  }

  function closeEmployeeSelection() {
    setEmployeeSelectionMode(false);
    setSelectedSalaryIds(new Set());
  }

  async function setSelectedEmployeesPaid(isPaid: boolean) {
    if (!selectedEmployees.length) return;
    await mutate("setSalaryPaidBulk", {
      ids: selectedEmployees.map((employee) => employee.id),
      isPaid,
    });
  }

  async function deleteSelectedEmployees() {
    if (!selectedEmployees.length) return;
    const confirmed = window.confirm(
      `${selectedEmployees.length} қызметкер және олардың барлық айлардағы айлық есептері толық өшіріледі. Бұл әрекетті қайтару мүмкін емес. Жалғастыру керек пе?`,
    );
    if (!confirmed) return;
    await mutate("deleteEmployeesBulk", {
      employeeIds: selectedEmployees.map(
        (employee) => employee.employeeId,
      ),
    });
  }

  function toggleExpenseSelection(expenseId: string) {
    setSelectedExpenseIds((current) => {
      const next = new Set(current);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  }

  function toggleAllExpenses() {
    setExpenseSelectionMode(true);
    setSelectedExpenseIds(
      allExpensesSelected
        ? new Set()
        : new Set(selectableExpenses.map((expense) => expense.id)),
    );
  }

  function closeExpenseSelection() {
    setExpenseSelectionMode(false);
    setSelectedExpenseIds(new Set());
  }

  async function setSelectedExpensesPaid(isPaid: boolean) {
    if (!selectedExpenses.length) return;
    await mutate("setExpensePaidBulk", {
      ids: selectedExpenses.map((expense) => expense.id),
      isPaid,
    });
  }

  async function deleteSelectedExpenses() {
    if (!selectedExpenses.length) return;
    const confirmed = window.confirm(
      `${selectedExpenses.length} шығын толық өшіріледі. Бұл әрекетті қайтару мүмкін емес. Жалғастыру керек пе?`,
    );
    if (!confirmed) return;
    await mutate("deleteExpensesBulk", {
      ids: selectedExpenses.map((expense) => expense.id),
    });
  }

  function newEmployee() {
    if (!data) return;
    setEmployeeDraft({
      fullName: "",
      position: "",
      departmentId:
        selectedDepartment ||
        data.departments.find((department) => !department.archivedAt)?.id ||
        "",
      paymentMethodId:
        data.paymentMethods.find((method) => !method.archivedAt)?.id ?? "",
      baseSalary: 0,
      components: [],
    });
  }

  function editEmployee(employee: SalaryRecord) {
    setEmployeeDraft({
      employeeId: employee.employeeId,
      fullName: employee.employeeName,
      position: employee.position,
      departmentId: employee.departmentId,
      paymentMethodId: employee.paymentMethodId,
      baseSalary: employee.baseSalary,
      components: employee.components.map((component) => ({ ...component })),
    });
  }

  async function loadMonthSourcePreview(sourceMonthId: string) {
    if (!data) return;
    if (sourceMonthId === data.selectedMonth.id) {
      setMonthSourcePreview(data);
      return;
    }

    setMonthSourceLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/payroll?month=${encodeURIComponent(sourceMonthId)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        window.location.reload();
        return;
      }
      const result = (await response.json()) as PayrollData & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Көшірілетін ай жүктелмеді.");
      }
      setMonthSourcePreview(result);
    } catch (caught) {
      setMonthSourcePreview(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Көшірілетін ай жүктелмеді.",
      );
    } finally {
      setMonthSourceLoading(false);
    }
  }

  function openMonthDialog(sourceMonthId = data?.selectedMonth.id ?? "") {
    if (!data) return;
    const sourceId = data.months.some((item) => item.id === sourceMonthId)
      ? sourceMonthId
      : data.selectedMonth.id;
    setMonthDraft({
      sourceMonthId: sourceId,
      targetMonthId: nextAvailableMonthId(
        sourceId,
        data.months.map((item) => item.id),
      ),
      copyRecurringExpenses: true,
    });
    setMonthSourcePreview(
      sourceId === data.selectedMonth.id ? data : null,
    );
    void loadMonthSourcePreview(sourceId);
  }

  function changeMonthDraftSource(sourceMonthId: string) {
    if (!data || !monthDraft) return;
    setMonthDraft({
      ...monthDraft,
      sourceMonthId,
      targetMonthId: nextAvailableMonthId(
        sourceMonthId,
        data.months.map((item) => item.id),
      ),
    });
    setMonthSourcePreview(
      sourceMonthId === data.selectedMonth.id ? data : null,
    );
    void loadMonthSourcePreview(sourceMonthId);
  }

  function openMonthAction(
    type: MonthActionDraft["type"],
    monthId: string,
    label: string,
  ) {
    setMonthNotice("");
    setMonthDeleteConfirmation("");
    setMonthActionDraft({ type, monthId, label });
  }

  async function confirmMonthAction() {
    if (!monthActionDraft) return;
    const action = monthActionDraft;
    const success = await mutate(
      action.type === "reset" ? "resetMonthPayments" : "deleteMonth",
      { targetMonthId: action.monthId },
    );
    if (!success) return;
    setMonthNotice(
      action.type === "reset"
        ? `${action.label}: барлық төлем белгілері сброс жасалды.`
        : `${action.label} есебі толық өшірілді.`,
    );
  }

  function navigateMonth(direction: "older" | "newer") {
    if (!data) return;
    const currentIndex = data.months.findIndex((item) => item.id === month);
    const nextIndex = direction === "older" ? currentIndex + 1 : currentIndex - 1;
    const target = data.months[nextIndex];
    if (!target) return;
    setMonthMenuOpen(false);
    setMonth(target.id);
    void load(target.id);
  }

  function selectMonth(targetMonth: string) {
    setMonthMenuOpen(false);
    if (targetMonth === month) return;
    setMonth(targetMonth);
    void load(targetMonth);
  }

  async function submitOneTimeExpense(event: FormEvent) {
    event.preventDefault();
    if (!data || !oneTimeExpenseDraft) return;
    if (!oneTimeExpenseDraft.name.trim()) {
      setError("Шығын атауын жазыңыз.");
      return;
    }
    if (oneTimeExpenseDraft.amount <= 0) {
      setError("Шығын сомасы 0 ₸-ден жоғары болуы керек.");
      return;
    }
    const saved = await mutate("saveOneTimeExpense", {
      id: oneTimeExpenseDraft.id,
      name: oneTimeExpenseDraft.name,
      amount: oneTimeExpenseDraft.amount,
    });
    if (saved) setOneTimeExpenseDraft(null);
  }

  function openOneTimeExpense(expense?: PayrollData["expenses"][number]) {
    setOneTimeExpenseDraft(
      expense
        ? { id: expense.id, name: expense.name, amount: expense.amount }
        : { name: "", amount: 0 },
    );
  }

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !data) return;
    try {
      const fileBuffer = await file.arrayBuffer();
      const isCsv = file.name.toLocaleLowerCase("kk-KZ").endsWith(".csv");
      let rawRows: Record<string, unknown>[];
      if (isCsv) {
        rawRows = rowsFromGrid(
          parseDelimitedGrid(new TextDecoder("utf-8").decode(fileBuffer)),
        );
      } else {
        const workbookSheets = await readExcelFile(fileBuffer);
        const selectedSheets = selectImportSheets(
          workbookSheets.map((sheet) => ({
            sheet: sheet.sheet,
            data: sheet.data as unknown[][],
          })),
          currentDepartment?.id ?? "",
          currentDepartment?.name ?? "",
        );
        rawRows = selectedSheets.flatMap((sheet) =>
          rowsFromGrid(sheet.data),
        );
      }
      if (!rawRows.length) {
        throw new Error(
          "Аты-жөні бар кесте табылмады. Excel-де «ФИО» немесе «Аты-жөні» бағаны болуы керек.",
        );
      }
      const knownDepartments = new Set(
        data.departments
          .filter((department) => !department.archivedAt)
          .map((department) => department.name.toLocaleLowerCase("kk-KZ")),
      );
      const knownMethods = new Set(
        data.paymentMethods
          .filter((method) => !method.archivedAt)
          .map((method) => method.name.toLocaleLowerCase("kk-KZ")),
      );
      const fallbackMethod =
        data.paymentMethods.find((method) => method.id === "method-transfer")
          ?.name ??
        data.paymentMethods.find((method) => !method.archivedAt)?.name ??
        "";
      const existing = new Set(
        data.salaries.map(
          (salary) =>
            `${salary.departmentName.toLocaleLowerCase("kk-KZ")}:${salary.employeeName.toLocaleLowerCase("kk-KZ")}`,
        ),
      );
      const seen = new Set<string>();
      const rows = rawRows.map((row) => {
        const parsed = extractPayrollImportRow(row, {
          fallbackDepartment: currentDepartment?.name ?? "",
          fallbackPaymentMethod: fallbackMethod,
          selectedMonth: data.selectedMonth.month,
        });
        const department = currentDepartment?.name ?? parsed.department;
        const {
          fullName,
          position,
          paymentMethod,
          baseSalary,
          components,
          isPaid,
        } = parsed;
        const key = `${department.toLocaleLowerCase("kk-KZ")}:${fullName.toLocaleLowerCase("kk-KZ")}`;
        let rowError = "";
        if (!department || !fullName || !paymentMethod) rowError = "Міндетті бағандар бос.";
        else if (!knownDepartments.has(department.toLocaleLowerCase("kk-KZ"))) rowError = "Белгісіз бөлім.";
        else if (!knownMethods.has(paymentMethod.toLocaleLowerCase("kk-KZ"))) rowError = "Белгісіз төлем түрі.";
        else if (
          !Number.isFinite(baseSalary) ||
          baseSalary < 0 ||
          components.some(
            (component) =>
              !Number.isFinite(component.amount) || component.amount <= 0,
          ) ||
          salaryTotal(
            baseSalary,
            components.map((component, index) => ({
              ...component,
              id: `import-${index}`,
            })),
          ) < 0
        ) rowError = "Сома дұрыс емес.";
        else if (existing.has(key)) rowError = "Бұл қызметкер осы айда бар.";
        else if (seen.has(key)) rowError = "Файлда қайталанған жол.";
        seen.add(key);
        return {
          department,
          fullName,
          position,
          paymentMethod,
          baseSalary,
          components,
          isPaid,
          error: rowError || undefined,
        };
      });
      setImportRows(rows);
    } catch {
      setError("Excel/CSV файлын оқу мүмкін болмады.");
    }
  }

  if (loading && !data) {
    return (
      <main className="loading-page">
        <div className="brand-mark">A</div>
        <div className="loading-line"><span /></div>
        <p>Деректер жүктеліп жатыр…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-page">
        <div className="form-error">{error || "Деректер жүктелмеді."}</div>
        <button className="primary-button" onClick={() => void load()}>Қайта жүктеу</button>
      </main>
    );
  }

  const previous = data.previousStats;
  const currentMonthIndex = data.months.findIndex((item) => item.id === month);
  const canOpenOlderMonth = currentMonthIndex < data.months.length - 1;
  const canOpenNewerMonth = currentMonthIndex > 0;
  const monthsByYear = data.months.reduce<
    Array<{ year: string; months: typeof data.months }>
  >((groups, item) => {
    const year = item.id.slice(0, 4);
    const group = groups.find((entry) => entry.year === year);
    if (group) group.months.push(item);
    else groups.push({ year, months: [item] });
    return groups;
  }, []);
  const oneTimeExpenses = data.expenses.filter(isOneTimeOtherExpense);
  const operationalExpenses = data.expenses.filter(
    (expense) => !isOneTimeOtherExpense(expense),
  );
  const operationalExpenseTotal = operationalExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const paidOperationalExpenseTotal = operationalExpenses.reduce(
    (sum, expense) => sum + (expense.isPaid ? expense.amount : 0),
    0,
  );
  const oneTimeExpenseTotal = oneTimeExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const activeDepartments = data.departments.filter(
    (department) => !department.archivedAt,
  );
  const settingsEmployeeCount = activeDepartments.reduce(
    (total, department) => total + department.employees.length,
    0,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">A</div>
          <div><strong>Айлық</strong><span>Қаржылық дашборд</span></div>
        </div>
        <nav aria-label="Негізгі бөлімдер">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => changeView("dashboard")}>
            <LayoutDashboard size={19} /><span>Дашборд</span>
          </button>
          <button className={view === "departments" ? "active" : ""} onClick={() => changeView("departments")}>
            <UsersRound size={19} /><span>Бөлімдер</span>
          </button>
          <button className={view === "expenses" ? "active" : ""} onClick={() => changeView("expenses")}>
            <ReceiptText size={19} /><span>Шығындар</span>
          </button>
          <button className={view === "other-expenses" ? "active" : ""} onClick={() => changeView("other-expenses")}>
            <ShoppingBag size={19} /><span>Басқа шығындар</span>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => changeView("settings")}>
            <Settings size={19} /><span>Баптаулар</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-chip"><CheckCircle2 size={16} /><span>Деректер қорғалған</span></div>
          <button onClick={() => void logout()}><LogOut size={18} /><span>Шығу</span></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="mobile-brand">Айлық</span>
            <h1>
              {view === "dashboard" && "Қаржылық шолу"}
              {view === "departments" && "Бөлімдердің айлығы"}
              {view === "expenses" && "Операциялық шығындар"}
              {view === "other-expenses" && "Басқа шығындар"}
              {view === "settings" && "Баптаулар"}
            </h1>
            <p>{data.selectedMonth.label} бойынша есеп</p>
          </div>
          <div className="topbar-actions period-actions">
            <div className="period-switcher">
              <button
                className="period-arrow"
                type="button"
                aria-label="Алдыңғы айды ашу"
                title="Алдыңғы ай"
                disabled={!canOpenOlderMonth || loading}
                onClick={() => navigateMonth("older")}
              >
                <ChevronLeft size={17} />
              </button>
              <div className="month-picker" ref={monthPicker}>
                <button
                  className={`month-select ${monthMenuOpen ? "open" : ""}`}
                  type="button"
                  aria-label="Есептік ай"
                  aria-expanded={monthMenuOpen}
                  aria-haspopup="listbox"
                  aria-controls="month-options"
                  onClick={() => setMonthMenuOpen((current) => !current)}
                >
                  <span className="period-icon"><CalendarDays size={18} /></span>
                  <span className="period-copy">
                    <small>Есептік кезең</small>
                    <b>{data.selectedMonth.label}</b>
                  </span>
                  <ChevronDown className="period-chevron" size={16} />
                </button>
                {monthMenuOpen && (
                  <div
                    className="month-menu"
                    id="month-options"
                    role="listbox"
                    aria-label="Есептік айды таңдаңыз"
                  >
                    <div className="month-menu-head">
                      <span className="month-menu-icon"><CalendarDays size={18} /></span>
                      <span>
                        <b>Есептік айды таңдаңыз</b>
                        <small>{data.months.length} кезең қолжетімді</small>
                      </span>
                    </div>
                    <div className="month-menu-list">
                      {monthsByYear.map((group) => (
                        <div className="month-year-group" key={group.year}>
                          <span className="month-year-label">{group.year} жыл</span>
                          {group.months.map((item) => {
                            const selected = item.id === month;
                            const monthName = item.label.replace(
                              /^\d{4}\s*ж\.\s*/,
                              "",
                            );
                            return (
                              <button
                                className={`month-option ${selected ? "selected" : ""}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                key={item.id}
                                onClick={() => selectMonth(item.id)}
                              >
                                <span className="month-option-calendar">
                                  {item.id.slice(5)}
                                </span>
                                <span className="month-option-copy">
                                  <b>{monthName}</b>
                                  <small>{item.label}</small>
                                </span>
                                {selected && (
                                  <span className="month-option-check">
                                    <Check size={15} strokeWidth={3} />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="period-arrow"
                type="button"
                aria-label="Келесі айды ашу"
                title="Келесі ай"
                disabled={!canOpenNewerMonth || loading}
                onClick={() => navigateMonth("newer")}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <button className="month-create-button" type="button" onClick={() => openMonthDialog()}>
              <span><Plus size={18} /></span>
              <span><b>Жаңа ай</b><small>Есепті көшіру</small></span>
            </button>
          </div>
        </header>

        {error && (
          <div className="global-error">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Қатені жабу"><X size={17} /></button>
          </div>
        )}

        {view === "dashboard" && (
          <div className="page-content dashboard-view">
            <section className="dashboard-expense-quick">
              <span className="quick-expense-icon"><ShoppingBag size={22} /></span>
              <div className="quick-expense-copy">
                <span className="eyebrow">Жұмсалған ақша</span>
                <h2>Жаңа шығынды бірден тіркеңіз</h2>
              </div>
              <div className="quick-expense-total">
                <small>Осы айда жұмсалды</small>
                <strong>{formatMoney(oneTimeExpenseTotal)}</strong>
                <span>{oneTimeExpenses.length} жазба</span>
              </div>
              <button className="primary-button" onClick={() => openOneTimeExpense()}>
                <Plus size={17} /> Жаңа шығын
              </button>
              <button className="text-button" onClick={() => changeView("other-expenses")}>
                Реестрді ашу
              </button>
            </section>

            <section className="kpi-grid">
              <KpiCard
                label="Жалпы жоспар"
                value={data.stats.plannedTotal}
                icon={<WalletCards size={21} />}
                detail="Айлықтар мен барлық шығындар"
                change={changePercent(data.stats.plannedTotal, previous?.plannedTotal)}
              />
              <KpiCard
                label="Төленген сома"
                value={data.stats.paidTotal}
                icon={<CheckCircle2 size={21} />}
                detail={`${data.stats.paidEmployees}/${data.stats.employeeCount} қызметкер`}
                change={changePercent(data.stats.paidTotal, previous?.paidTotal)}
                tone="success"
              />
              <KpiCard
                label="Қалған сома"
                value={data.stats.remainingTotal}
                icon={<Clock3 size={21} />}
                detail={`${data.stats.paymentProgress}% орындалды`}
                change={changePercent(data.stats.remainingTotal, previous?.remainingTotal)}
                tone="warning"
              />
            </section>

            <section className="dashboard-grid">
              <article className="panel progress-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Айлық прогресс</span><h2>Төлемдердің орындалуы</h2></div>
                  <strong>{data.stats.paymentProgress}%</strong>
                </div>
                <div className="progress-hero">
                  <div className="progress-ring" style={{ "--progress": `${data.stats.paymentProgress * 3.6}deg` } as React.CSSProperties}>
                    <div><strong>{data.stats.paymentProgress}%</strong><span>төленді</span></div>
                  </div>
                  <dl>
                    <div><dt>Айлық қоры</dt><dd>{formatMoney(data.stats.salaryTotal)}</dd></div>
                    <div><dt>Басқа шығындар</dt><dd>{formatMoney(data.stats.expenseTotal)}</dd></div>
                    <div className="accent"><dt>Қалғаны</dt><dd>{formatMoney(data.stats.remainingTotal)}</dd></div>
                  </dl>
                </div>
                <div className="progress-line"><span style={{ width: `${data.stats.paymentProgress}%` }} /></div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Бөлімдер</span><h2>Айлық қорының бөлінуі</h2></div>
                  <button className="text-button" onClick={() => changeView("departments")}>Толық көру</button>
                </div>
                <BreakdownBars items={data.departmentBreakdown} emptyText="Қызметкерлер қосылғанда бөлімдер статистикасы шығады." />
              </article>
            </section>

            <section className="dashboard-grid lower">
              <article className="panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Шығындар</span><h2>Категориялар бойынша</h2></div>
                  <button className="text-button" onClick={() => changeView("expenses")}>Шығын қосу</button>
                </div>
                <BreakdownBars items={data.expenseBreakdown} emptyText="Шығындар қосылғанда категориялар статистикасы шығады." />
              </article>
              <article className="panel changes-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Салыстыру</span><h2>Өткен аймен өзгеріс</h2></div>
                  {data.previousMonth && <span className="period-chip">{data.previousMonth.label}</span>}
                </div>
                {!data.previousMonth ? (
                  <EmptyState icon={<CalendarDays size={23} />} title="Алдыңғы ай жоқ" text="Келесі айды көшіргеннен кейін салыстыру автоматты түрде пайда болады." />
                ) : (
                  <div className="change-list">
                    {[...data.departmentBreakdown, ...data.expenseBreakdown]
                      .filter((item) => item.change !== 0)
                      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
                      .slice(0, 6)
                      .map((item) => (
                        <div key={`${item.id}-${item.name}`}>
                          <span><i className={item.change > 0 ? "up-dot" : "down-dot"} />{item.name}</span>
                          <strong className={item.change > 0 ? "expense-up" : "expense-down"}>
                            {item.change > 0 ? "+" : "−"}{formatMoney(Math.abs(item.change))}
                          </strong>
                        </div>
                      ))}
                    {![...data.departmentBreakdown, ...data.expenseBreakdown].some((item) => item.change !== 0) && <p className="chart-empty">Өткен аймен салыстырғанда өзгеріс жоқ.</p>}
                  </div>
                )}
              </article>
            </section>
          </div>
        )}

        {view === "departments" && (
          <div className="page-content">
            <section className="department-tabs" aria-label="Бөлімдер">
              {data.departments.filter((department) => !department.archivedAt).map((department) => (
                <button
                  key={department.id}
                  className={selectedDepartment === department.id ? "active" : ""}
                  onClick={() => {
                    setSelectedDepartment(department.id);
                    setEmployeeSelectionMode(false);
                    setSelectedSalaryIds(new Set());
                  }}
                >
                  {department.name}<span>{department.employees.length}</span>
                </button>
              ))}
            </section>
            {currentDepartment ? (
              <>
                <section className="department-summary">
                  <div><span>Бөлімнің айлық қоры</span><strong>{formatMoney(currentDepartment.total)}</strong></div>
                  <div><span>Төленген</span><strong className="success-text">{formatMoney(currentDepartment.paid)}</strong></div>
                  <div><span>Қалғаны</span><strong className="primary-text">{formatMoney(currentDepartment.remaining)}</strong></div>
                  <div><span>Қызметкерлер</span><strong>{currentDepartment.employees.length}</strong></div>
                </section>
                <section className="panel table-panel">
                  <div className="table-toolbar">
                    <div>
                      <span className="eyebrow">Қызметкерлер</span>
                      <h2>{currentDepartment.name}</h2>
                    </div>
                    <div className="toolbar-actions">
                      <label className="search-box"><Search size={17} /><input placeholder="Аты немесе төлем түрі" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                    </div>
                  </div>
                  {filteredEmployees.length ? (
                    <>
                      <div className={`employee-bulk-bar ${employeeSelectionMode ? "active" : ""}`}>
                        {!employeeSelectionMode ? (
                          <button
                            className="selection-start"
                            type="button"
                            onClick={toggleAllEmployees}
                          >
                            <CheckCircle2 size={16} />
                            Барлығын таңдау
                          </button>
                        ) : (
                          <>
                            <div className="selection-controls">
                              <label className="bulk-select">
                                <input
                                  type="checkbox"
                                  checked={allEmployeesSelected}
                                  onChange={toggleAllEmployees}
                                />
                                <span>
                                  {allEmployeesSelected
                                    ? "Барлығы таңдалды"
                                    : "Барлығын таңдау"}
                                </span>
                              </label>
                              <button
                                className="selection-close"
                                type="button"
                                onClick={closeEmployeeSelection}
                              >
                                <X size={14} /> Аяқтау
                              </button>
                            </div>
                            <div className="bulk-actions">
                              <strong>
                                {selectedEmployees.length
                                  ? `${selectedEmployees.length} қызметкер таңдалды`
                                  : "Қажетті қызметкерлерді белгілеңіз"}
                              </strong>
                              {selectedEmployees.length > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void setSelectedEmployeesPaid(true)}
                                    disabled={saving}
                                  >
                                    <CheckCircle2 size={15} /> Төленді
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void setSelectedEmployeesPaid(false)}
                                    disabled={saving}
                                  >
                                    <Clock3 size={15} /> Төленбеді
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => void deleteSelectedEmployees()}
                                    disabled={saving}
                                  >
                                    <Trash2 size={15} /> Өшіру
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className={`data-table employee-table ${employeeSelectionMode ? "selection-mode" : ""}`}>
                        <div className="table-head">
                          {employeeSelectionMode && <span />}
                          <span>Қызметкер</span><span>Төлем түрі</span><span>Негізгі айлық</span><span>Қосымша</span><span>Жалпы сома</span><span>Төленді</span><span />
                        </div>
                        {filteredEmployees.map((employee) => (
                          <div className={`table-row ${selectedSalaryIds.has(employee.id) ? "selected-row" : ""}`} key={employee.id}>
                            {employeeSelectionMode && (
                              <label className="employee-select">
                                <input
                                  type="checkbox"
                                  aria-label={`${employee.employeeName} таңдау`}
                                  checked={selectedSalaryIds.has(employee.id)}
                                  onChange={() => toggleEmployeeSelection(employee.id)}
                                />
                              </label>
                            )}
                            <span className="person-cell"><i>{employee.employeeName.slice(0, 1).toUpperCase()}</i><span><b>{employee.employeeName}</b>{employee.position && <small>{employee.position}</small>}</span></span>
                            <span><span className="method-chip">{employee.paymentMethodName}</span></span>
                            <span className="money-cell">{formatMoney(employee.baseSalary)}</span>
                            <span className="component-cell">
                              {employee.components.length ? employee.components.map((component) => <small className={component.kind} key={component.id}>{component.kind === "deduction" ? "−" : "+"}{component.name}: {formatMoney(component.amount)}</small>) : <small>—</small>}
                            </span>
                            <strong className="money-cell total-cell">{formatMoney(employee.total)}</strong>
                            <span>
                              <button
                                className={`paid-toggle ${employee.isPaid ? "checked" : ""}`}
                                onClick={() => void mutate("toggleSalaryPaid", { id: employee.id, isPaid: !employee.isPaid })}
                                aria-label={employee.isPaid ? "Төленді белгісін алу" : "Төленді деп белгілеу"}
                                disabled={saving}
                              >
                                <i>{employee.isPaid && <Check size={14} />}</i>{employee.isPaid ? "Иә" : "Жоқ"}
                              </button>
                            </span>
                            <span className="row-actions">
                              <button onClick={() => editEmployee(employee)} aria-label="Өзгерту"><Pencil size={16} /></button>
                              <button
                                className="danger"
                                onClick={() =>
                                  window.confirm(
                                    `${employee.employeeName} және оның барлық айлардағы айлық есептері толық өшіріледі. Бұл әрекетті қайтару мүмкін емес. Жалғастыру керек пе?`,
                                  ) &&
                                  void mutate("deleteEmployee", {
                                    employeeId: employee.employeeId,
                                  })
                                }
                                aria-label="Қызметкерді толық өшіру"
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon={<UsersRound size={25} />}
                      title="Қызметкерлер жоқ"
                      text="Қызметкерлерді Баптаулар бөлімінен қосыңыз немесе Excel файлын импорттаңыз."
                      action={<button className="primary-button" onClick={openEmployeeSettings}><Settings size={17} /> Баптауларды ашу</button>}
                    />
                  )}
                </section>
              </>
            ) : <EmptyState icon={<Building2 size={25} />} title="Бөлім жоқ" text="Баптаулардан бірінші бөлімді қосыңыз." />}
          </div>
        )}

        {view === "other-expenses" && (
          <div className="page-content">
            <section className="other-expense-hero">
              <div className="other-expense-heading">
                <span className="quick-expense-icon"><ShoppingBag size={22} /></span>
                <div>
                  <span className="eyebrow">Жұмсалған ақша</span>
                  <h2>{data.selectedMonth.label} реестрі</h2>
                  <p>Бұл жерге ақшасы осы айда жұмсалып қойған шығындар тіркеледі. Олар келесі айға көшірілмейді.</p>
                </div>
              </div>
              <div className="other-expense-metrics">
                <div><small>Осы айда жұмсалды</small><strong className="success-text">{formatMoney(oneTimeExpenseTotal)}</strong></div>
                <div><small>Реестрдегі жазба</small><strong>{oneTimeExpenses.length}</strong></div>
              </div>
              <button className="primary-button" onClick={() => openOneTimeExpense()}>
                <Plus size={17} /> Жаңа шығын қосу
              </button>
            </section>
            <section className="panel table-panel">
              <div className="table-toolbar">
                <div><span className="eyebrow">Реестр</span><h2>Басқа шығындар</h2></div>
                <span className="count-chip">{oneTimeExpenses.length} жазба</span>
              </div>
              {oneTimeExpenses.length ? (
                <div className="data-table other-expense-table">
                  <div className="table-head"><span>Шығын атауы</span><span>Жұмсалған сома</span><span /></div>
                  {oneTimeExpenses.map((expense) => (
                    <div className="table-row" key={expense.id}>
                      <span className="expense-name">
                        <i><ShoppingBag size={17} /></i>
                        <span><b>{expense.name}</b><small>Басқа шығындар · осы айда жұмсалды</small></span>
                      </span>
                      <strong className="money-cell total-cell">{formatMoney(expense.amount)}</strong>
                      <span className="row-actions">
                        <button onClick={() => openOneTimeExpense(expense)} aria-label="Басқа шығынды өзгерту"><Pencil size={16} /></button>
                        <button
                          className="danger"
                          onClick={() => window.confirm(`${expense.name} реестрден өшірілсін бе?`) && void mutate("deleteExpense", { id: expense.id })}
                          aria-label="Басқа шығынды өшіру"
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<ShoppingBag size={25} />}
                  title="Басқа шығындар жоқ"
                  text="Парта, орындық немесе басқа бір реттік сатып алуды осы айдың реестріне қосыңыз."
                  action={<button className="primary-button" onClick={() => openOneTimeExpense()}><Plus size={17} /> Жаңа шығын қосу</button>}
                />
              )}
            </section>
          </div>
        )}

        {view === "expenses" && (
          <div className="page-content">
            <section className="expense-hero">
              <div><span className="eyebrow">Операциялық бюджет</span><strong>{formatMoney(operationalExpenseTotal)}</strong><p>Тұрақты және категориялық шығындар</p></div>
              <div><span>Төленген шығын</span><strong>{formatMoney(paidOperationalExpenseTotal)}</strong></div>
              <button className="primary-button light" onClick={() => setExpenseDraft({ name: "", categoryId: data.expenseCategories.find((category) => !category.archivedAt)?.id ?? "", amount: 0, isRecurring: true })}><Plus size={18} /> Шығын қосу</button>
            </section>
            <section className="panel table-panel">
              <div className="table-toolbar">
                <div><span className="eyebrow">Шығындар тізімі</span><h2>{data.selectedMonth.label}</h2></div>
                <span className="count-chip">{operationalExpenses.length} жазба</span>
              </div>
              {operationalExpenses.length ? (
                <>
                  <div className={`employee-bulk-bar ${expenseSelectionMode ? "active" : ""}`}>
                    {!expenseSelectionMode ? (
                      <button
                        className="selection-start"
                        type="button"
                        onClick={toggleAllExpenses}
                      >
                        <CheckCircle2 size={16} />
                        Барлығын таңдау
                      </button>
                    ) : (
                      <>
                        <div className="selection-controls">
                          <label className="bulk-select">
                            <input
                              type="checkbox"
                              checked={allExpensesSelected}
                              onChange={toggleAllExpenses}
                            />
                            <span>
                              {allExpensesSelected
                                ? "Барлығы таңдалды"
                                : "Барлығын таңдау"}
                            </span>
                          </label>
                          <button
                            className="selection-close"
                            type="button"
                            onClick={closeExpenseSelection}
                          >
                            <X size={14} /> Аяқтау
                          </button>
                        </div>
                        <div className="bulk-actions">
                          <strong>
                            {selectedExpenses.length
                              ? `${selectedExpenses.length} шығын таңдалды`
                              : "Қажетті шығындарды белгілеңіз"}
                          </strong>
                          {selectedExpenses.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => void setSelectedExpensesPaid(true)}
                                disabled={saving}
                              >
                                <CheckCircle2 size={15} /> Төленді
                              </button>
                              <button
                                type="button"
                                onClick={() => void setSelectedExpensesPaid(false)}
                                disabled={saving}
                              >
                                <Clock3 size={15} /> Төленбеді
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void deleteSelectedExpenses()}
                                disabled={saving}
                              >
                                <Trash2 size={15} /> Өшіру
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className={`data-table expense-table ${expenseSelectionMode ? "selection-mode" : ""}`}>
                    <div className="table-head">
                      {expenseSelectionMode && <span />}
                      <span>Шығын</span><span>Категория</span><span>Қайталанады</span><span>Сома</span><span>Төленді</span><span />
                    </div>
                    {operationalExpenses.map((expense) => (
                      <div className={`table-row ${selectedExpenseIds.has(expense.id) ? "selected-row" : ""}`} key={expense.id}>
                        {expenseSelectionMode && (
                          <label className="employee-select">
                            <input
                              type="checkbox"
                              aria-label={`${expense.name} таңдау`}
                              checked={selectedExpenseIds.has(expense.id)}
                              onChange={() => toggleExpenseSelection(expense.id)}
                            />
                          </label>
                        )}
                        <span className="expense-name"><i><ReceiptText size={17} /></i><b>{expense.name}</b></span>
                        <span><span className="method-chip">{expense.categoryName}</span></span>
                        <span>{expense.isRecurring ? "Әр ай сайын" : "Бір рет"}</span>
                        <strong className="money-cell total-cell">{formatMoney(expense.amount)}</strong>
                        <span>
                          <button className={`paid-toggle ${expense.isPaid ? "checked" : ""}`} onClick={() => void mutate("toggleExpensePaid", { id: expense.id, isPaid: !expense.isPaid })} disabled={saving}>
                            <i>{expense.isPaid && <Check size={14} />}</i>{expense.isPaid ? "Иә" : "Жоқ"}
                          </button>
                        </span>
                        <span className="row-actions">
                          <button onClick={() => setExpenseDraft({ id: expense.id, name: expense.name, categoryId: expense.categoryId, amount: expense.amount, isRecurring: expense.isRecurring })} aria-label="Өзгерту"><Pencil size={16} /></button>
                          <button onClick={() => window.confirm(`${expense.name} өшірілсін бе?`) && void mutate("deleteExpense", { id: expense.id })} aria-label="Өшіру"><Trash2 size={16} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={<ReceiptText size={25} />} title="Шығындар жоқ" text="Аренда, интернет немесе басқа операциялық шығынды қосыңыз." action={<button className="primary-button" onClick={() => setExpenseDraft({ name: "", categoryId: data.expenseCategories.find((category) => !category.archivedAt)?.id ?? "", amount: 0, isRecurring: true })}><Plus size={17} /> Шығын қосу</button>} />
              )}
            </section>
          </div>
        )}

        {view === "settings" && (
          <div className="page-content settings-page">
            <section className="settings-overview">
              <span className="settings-overview-icon"><Settings size={24} /></span>
              <div className="settings-overview-copy">
                <span className="eyebrow">Басқару орталығы</span>
                <h2>Барлық баптау бір жерде</h2>
                <p>Қызметкерлерді, бөлімдерді және қаржылық анықтамалықтарды осы жерден басқарыңыз.</p>
              </div>
              <div className="settings-overview-metrics">
                <div><small>Қызметкерлер</small><strong>{settingsEmployeeCount}</strong></div>
                <div><small>Белсенді бөлім</small><strong>{activeDepartments.length}</strong></div>
                <div><small>Есептік ай</small><strong>{data.months.length}</strong></div>
              </div>
            </section>

            <nav className="settings-tabs" aria-label="Баптаулар бөлімдері">
              <button className={settingsSection === "months" ? "active" : ""} onClick={() => setSettingsSection("months")}>
                <CalendarDays size={17} /><span><b>Айлар</b><small>Көшіру, сброс, өшіру</small></span>
              </button>
              <button className={settingsSection === "employees" ? "active" : ""} onClick={() => setSettingsSection("employees")}>
                <UsersRound size={17} /><span><b>Қызметкерлер</b><small>Қосу және импорт</small></span>
              </button>
              <button className={settingsSection === "departments" ? "active" : ""} onClick={() => setSettingsSection("departments")}>
                <Building2 size={17} /><span><b>Бөлімдер</b><small>Құрылымды басқару</small></span>
              </button>
              <button className={settingsSection === "methods" ? "active" : ""} onClick={() => setSettingsSection("methods")}>
                <WalletCards size={17} /><span><b>Төлем түрлері</b><small>Анықтамалық</small></span>
              </button>
              <button className={settingsSection === "categories" ? "active" : ""} onClick={() => setSettingsSection("categories")}>
                <ReceiptText size={17} /><span><b>Шығын категориялары</b><small>Жіктеу</small></span>
              </button>
              <button className={settingsSection === "security" ? "active" : ""} onClick={() => setSettingsSection("security")}>
                <CheckCircle2 size={17} /><span><b>Қауіпсіздік</b><small>Ортақ пароль</small></span>
              </button>
            </nav>

            {settingsSection === "months" && (
              <section className="panel settings-workspace month-management">
                <div className="settings-workspace-heading">
                  <div>
                    <span className="eyebrow">Есептік кезеңдер</span>
                    <h2>Айларды басқару</h2>
                    <p>Кез келген айды негізге алып жаңа есеп құрыңыз, төлем белгілерін сброс жасаңыз немесе қажет емес айды толық өшіріңіз.</p>
                  </div>
                  <button className="primary-button" onClick={() => openMonthDialog()}>
                    <Plus size={17} /> Жаңа ай құру
                  </button>
                </div>

                {monthNotice && (
                  <div className="settings-notice" role="status">
                    <CheckCircle2 size={18} />
                    <span>{monthNotice}</span>
                    <button type="button" onClick={() => setMonthNotice("")} aria-label="Хабарламаны жабу">
                      <X size={15} />
                    </button>
                  </div>
                )}

                <div className="month-management-summary">
                  <span className="month-management-summary-icon">
                    <CalendarDays size={22} />
                  </span>
                  <div>
                    <small>Қазір ашық есеп</small>
                    <strong>{data.selectedMonth.label}</strong>
                    <span>Барлығы {data.months.length} есептік ай сақталған</span>
                  </div>
                  <div className="month-management-summary-amount">
                    <small>Жалпы жоспар</small>
                    <strong>{formatMoney(data.stats.plannedTotal)}</strong>
                  </div>
                </div>

                <div className="month-management-list">
                  {data.months.map((item) => {
                    const isCurrent = item.id === data.selectedMonth.id;
                    return (
                      <article
                        className={`month-management-row ${isCurrent ? "active" : ""}`}
                        key={item.id}
                      >
                        <span className="month-period-badge">
                          <b>{String(item.month).padStart(2, "0")}</b>
                          <small>{item.year}</small>
                        </span>
                        <div className="month-management-copy">
                          <span>
                            <strong>{item.label}</strong>
                            {isCurrent && <em>Қазір ашық</em>}
                          </span>
                          <small>Айлықтар, компоненттер және осы кезеңнің шығындары</small>
                        </div>
                        <div className="month-management-actions">
                          {!isCurrent && (
                            <button className="month-action open" type="button" onClick={() => selectMonth(item.id)}>
                              Айды ашу
                            </button>
                          )}
                          <button className="month-action" type="button" onClick={() => openMonthDialog(item.id)}>
                            <Copy size={15} /> Осы айдан көшіру
                          </button>
                          <button className="month-action" type="button" onClick={() => openMonthAction("reset", item.id, item.label)}>
                            <RotateCcw size={15} /> Төлемдерді сброс
                          </button>
                          <button
                            className="month-action danger"
                            type="button"
                            disabled={data.months.length === 1}
                            onClick={() => openMonthAction("delete", item.id, item.label)}
                          >
                            <Trash2 size={15} /> Өшіру
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="month-management-help">
                  <TriangleAlert size={18} />
                  <p><b>Маңызды:</b> «Сброс» тек төлем белгілерін алып тастайды. Айлықтар мен шығын сомалары сақталады. «Өшіру» таңдалған айдың барлық есептік деректерін қайтарымсыз жояды.</p>
                </div>
              </section>
            )}

            {settingsSection === "employees" && (
              <section className="panel settings-workspace employee-management">
                <div className="settings-workspace-heading">
                  <div>
                    <span className="eyebrow">Команданы басқару</span>
                    <h2>Қызметкерлер</h2>
                    <p>Таңдалған айдағы қызметкерлерді қосыңыз, импорттаңыз немесе өзгертіңіз.</p>
                  </div>
                  <div className="employee-management-actions">
                    <label className="search-box"><Search size={17} /><input placeholder="Аты немесе төлем түрі" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                    <button className="secondary-button" onClick={() => importInput.current?.click()}><Upload size={17} /> Excel импорт</button>
                    <input ref={importInput} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void readImport(event)} />
                    <button className="primary-button" onClick={newEmployee}><Plus size={17} /> Қызметкер қосу</button>
                  </div>
                </div>

                <div className="employee-management-filter">
                  <label className="settings-department-picker">
                    <span>Қызметкер қосылатын бөлім</span>
                    <span className="settings-select-control">
                      <Building2 size={16} />
                      <select
                        aria-label="Қызметкерлер бөлімі"
                        value={selectedDepartment}
                        onChange={(event) => {
                          setSelectedDepartment(event.target.value);
                          setSearch("");
                        }}
                      >
                        {activeDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} />
                    </span>
                  </label>
                  <div className="employee-management-stat">
                    <span><UsersRound size={16} /> Қызметкерлер</span>
                    <strong>{currentDepartment?.employees.length ?? 0}</strong>
                  </div>
                  <div className="employee-management-stat amount">
                    <span><WalletCards size={16} /> Айлық қоры</span>
                    <strong>{formatMoney(currentDepartment?.total ?? 0)}</strong>
                  </div>
                </div>

                {currentDepartment?.employees.length ? (
                  <div className="data-table settings-employee-table">
                    <div className="table-head"><span>Қызметкер</span><span>Лауазым</span><span>Төлем түрі</span><span>Негізгі айлық</span><span>Жалпы сома</span><span /></div>
                    {filteredEmployees.map((employee) => (
                      <div className="table-row" key={employee.id}>
                        <span className="person-cell"><i>{employee.employeeName.slice(0, 1).toUpperCase()}</i><span><b>{employee.employeeName}</b><small>{currentDepartment.name}</small></span></span>
                        <span>{employee.position || "Көрсетілмеген"}</span>
                        <span><span className="method-chip">{employee.paymentMethodName}</span></span>
                        <span className="money-cell">{formatMoney(employee.baseSalary)}</span>
                        <strong className="money-cell total-cell">{formatMoney(employee.total)}</strong>
                        <span className="row-actions">
                          <button onClick={() => editEmployee(employee)} aria-label={`${employee.employeeName} өзгерту`}><Pencil size={16} /></button>
                          <button
                            className="danger"
                            onClick={() =>
                              window.confirm(
                                `${employee.employeeName} және оның барлық айлардағы айлық есептері толық өшіріледі. Бұл әрекетті қайтару мүмкін емес. Жалғастыру керек пе?`,
                              ) &&
                              void mutate("deleteEmployee", {
                                employeeId: employee.employeeId,
                              })
                            }
                            aria-label={`${employee.employeeName} толық өшіру`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<UsersRound size={25} />}
                    title="Бұл бөлімде қызметкер жоқ"
                    text="Бір қызметкер қосыңыз немесе дайын Excel/CSV файлын импорттаңыз."
                    action={(
                      <span className="empty-actions">
                        <button className="secondary-button" onClick={() => importInput.current?.click()}><Upload size={17} /> Excel импорт</button>
                        <button className="primary-button" onClick={newEmployee}><Plus size={17} /> Қызметкер қосу</button>
                      </span>
                    )}
                  />
                )}
              </section>
            )}

            {settingsSection === "departments" && (
              <section className="panel settings-workspace reference-workspace">
                <div className="settings-workspace-heading">
                  <div><span className="eyebrow">Ұйым құрылымы</span><h2>Бөлімдер</h2><p>Бөлім атауларын және қолжетімділігін басқарыңыз.</p></div>
                  <button className="primary-button" onClick={() => setEntityDraft({ type: "department", name: "" })}><Plus size={16} /> Бөлім қосу</button>
                </div>
                <div className="settings-list">
                  {data.departments.map((department) => (
                    <div key={department.id}>
                      <span><i><Building2 size={17} /></i><span><b>{department.name}</b><small>{department.employees.length} қызметкер</small></span>{department.archivedAt && <em>Архив</em>}</span>
                      <span className="settings-actions"><button onClick={() => setEntityDraft({ type: "department", id: department.id, name: department.name })} aria-label={`${department.name} өзгерту`}><Pencil size={15} /></button>{!department.archivedAt && <button onClick={() => window.confirm(`${department.name} архивтелсін бе?`) && void mutate("archiveDepartment", { id: department.id })} aria-label={`${department.name} архивтеу`}><Archive size={15} /></button>}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {settingsSection === "methods" && (
              <section className="panel settings-workspace reference-workspace">
                <div className="settings-workspace-heading">
                  <div><span className="eyebrow">Айлық анықтамалығы</span><h2>Төлем түрлері</h2><p>Қызметкерлерге қолжетімді төлем форматтарын басқарыңыз.</p></div>
                  <button className="primary-button" onClick={() => setEntityDraft({ type: "method", name: "" })}><Plus size={16} /> Төлем түрін қосу</button>
                </div>
                <div className="settings-list">
                  {data.paymentMethods.map((method) => (
                    <div key={method.id}>
                      <span><i><WalletCards size={17} /></i><span><b>{method.name}</b><small>Қызметкердің төлем форматы</small></span>{method.isSystem && <em>Дайын</em>}{method.archivedAt && <em>Архив</em>}</span>
                      <span className="settings-actions"><button onClick={() => setEntityDraft({ type: "method", id: method.id, name: method.name })} aria-label={`${method.name} өзгерту`}><Pencil size={15} /></button>{!method.archivedAt && <button onClick={() => window.confirm(`${method.name} архивтелсін бе?`) && void mutate("archivePaymentMethod", { id: method.id })} aria-label={`${method.name} архивтеу`}><Archive size={15} /></button>}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {settingsSection === "categories" && (
              <section className="panel settings-workspace reference-workspace">
                <div className="settings-workspace-heading">
                  <div><span className="eyebrow">Шығын анықтамалығы</span><h2>Шығын категориялары</h2><p>Операциялық шығындарды дұрыс жіктеу үшін категорияларды реттеңіз.</p></div>
                  <button className="primary-button" onClick={() => setEntityDraft({ type: "category", name: "" })}><Plus size={16} /> Категория қосу</button>
                </div>
                <div className="settings-list">
                  {data.expenseCategories.map((category) => (
                    <div key={category.id}>
                      <span>
                        <i><ReceiptText size={17} /></i>
                        <span><b>{category.name}</b><small>{category.id === OTHER_EXPENSE_CATEGORY_ID ? "Бір реттік шығындар реестрі" : "Операциялық шығын категориясы"}</small></span>
                        {category.id === OTHER_EXPENSE_CATEGORY_ID && <em>Жүйелік</em>}
                        {category.archivedAt && <em>Архив</em>}
                      </span>
                      {category.id !== OTHER_EXPENSE_CATEGORY_ID && (
                        <span className="settings-actions">
                          <button onClick={() => setEntityDraft({ type: "category", id: category.id, name: category.name })} aria-label={`${category.name} өзгерту`}><Pencil size={15} /></button>
                          {!category.archivedAt && <button onClick={() => window.confirm(`${category.name} архивтелсін бе?`) && void mutate("archiveExpenseCategory", { id: category.id })} aria-label={`${category.name} архивтеу`}><Archive size={15} /></button>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {settingsSection === "security" && (
              <section className="panel security-panel settings-security">
                <div className="security-icon"><CheckCircle2 size={24} /></div>
                <div><span className="eyebrow">Қауіпсіздік</span><h2>Ортақ пароль</h2><p>Пароль өзгертілгенде барлық ашық сессия жабылып, қайта кіру қажет болады.</p></div>
                <button className="primary-button" onClick={() => setPasswordOpen(true)}>Парольді өзгерту</button>
              </section>
            )}
          </div>
        )}
      </main>

      {monthDraft && (
        <Modal title="Жаңа есептік ай" subtitle="Айлық есепті дайындау" onClose={() => setMonthDraft(null)} wide>
          <form
            className="modal-form month-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate("createMonth", {
                newMonthId: monthDraft.targetMonthId,
                sourceMonthId: monthDraft.sourceMonthId,
                copyRecurringExpenses: monthDraft.copyRecurringExpenses,
              });
            }}
          >
            <div className="month-setup">
              <label className="month-source-picker">
                <span>Негіз болатын ай</span>
                <span className="month-source-control">
                  <CalendarDays size={18} />
                  <select
                    aria-label="Негіз болатын ай"
                    value={monthDraft.sourceMonthId}
                    onChange={(event) =>
                      changeMonthDraftSource(event.target.value)
                    }
                  >
                    {data.months.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </span>
                <small>Қызметкерлер мен айлық сомалары осы есептен көшіріледі</small>
              </label>
              <label className="month-target">
                <span>Құрылатын ай</span>
                <input
                  required
                  type="month"
                  value={monthDraft.targetMonthId}
                  min="2020-01"
                  max="2100-12"
                  onChange={(event) =>
                    setMonthDraft({
                      ...monthDraft,
                      targetMonthId: event.target.value,
                    })
                  }
                />
                {data.months.some((item) => item.id === monthDraft.targetMonthId) && (
                  <small className="field-error">Бұл ай бұрыннан бар. Басқа айды таңдаңыз.</small>
                )}
              </label>
            </div>
            <div className={`copy-preview ${monthSourceLoading ? "loading" : ""}`}>
              <div><span><UsersRound size={18} /></span><div><small>Көшірілетін қызметкерлер</small><strong>{copyableEmployeeCount}</strong><em>Кураторлар мен Сату бөлімі — бос</em></div></div>
              <div><span><WalletCards size={18} /></span><div><small>Көшірілетін айлық қоры</small><strong>{formatMoney(copyableSalaryTotal)}</strong></div></div>
              <div><span><ReceiptText size={18} /></span><div><small>Тұрақты шығындар</small><strong>{formatMoney(sourceRecurringExpenseTotal)}</strong><em>{sourceRecurringExpenses.length} жазба</em></div></div>
            </div>
            <label className="check-label copy-option">
              <input
                type="checkbox"
                checked={monthDraft.copyRecurringExpenses}
                onChange={(event) =>
                  setMonthDraft({
                    ...monthDraft,
                    copyRecurringExpenses: event.target.checked,
                  })
                }
              />
              <span><b>Қайталанатын шығындарды көшіру</b><small>Аренда, интернет және тұрақты сервистер жаңа айға қосылады</small></span>
            </label>
            <p className="modal-note">
              Академ, Мұғалімдер, Маркетинг Eduser және Ustaz Media
              қызметкерлері айлық компоненттерімен бірге көшіріледі.
              Кураторлар мен Сату бөлімі жаңа айда бос ашылады — олардың жаңа
              тізімін Excel арқылы импорттайсыз. «Төленді» белгілері нөлден
              басталады.
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setMonthDraft(null)}>Болдырмау</button>
              <button
                className="primary-button"
                disabled={
                  saving ||
                  monthSourceLoading ||
                  !monthSourceData ||
                  !monthDraft.sourceMonthId ||
                  !monthDraft.targetMonthId ||
                  data.months.some((item) => item.id === monthDraft.targetMonthId)
                }
              >
                {saving ? "Ай дайындалып жатыр…" : "Айды құрып, ашу"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {monthActionDraft && (
        <Modal
          title={
            monthActionDraft.type === "reset"
              ? "Төлем белгілерін сброс жасау"
              : "Есептік айды толық өшіру"
          }
          subtitle="Айларды басқару"
          onClose={() => {
            if (saving) return;
            setMonthActionDraft(null);
            setMonthDeleteConfirmation("");
          }}
          wide
        >
          <form
            className="modal-form month-action-form"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmMonthAction();
            }}
          >
            <div className={`month-action-warning ${monthActionDraft.type}`}>
              <span>
                {monthActionDraft.type === "reset"
                  ? <RotateCcw size={23} />
                  : <TriangleAlert size={23} />}
              </span>
              <div>
                <small>Таңдалған есептік кезең</small>
                <strong>{monthActionDraft.label}</strong>
                <p>
                  {monthActionDraft.type === "reset"
                    ? "Барлық қызметкер мен операциялық шығынның «Төленді» белгісі алынады. Аты-жөндер, айлықтар, компоненттер және шығын сомалары өзгермейді. Бір реттік жұмсалған ақша реестрі бұрынғыдай сақталады."
                    : "Осы айдағы айлық snapshot-тары, компоненттер және барлық шығын жазбалары толық жойылады. Қызметкерлер анықтамалығы мен басқа айлардың есептері сақталады."}
                </p>
              </div>
            </div>

            {monthActionDraft.type === "delete" && (
              <label className="month-delete-confirmation">
                <span>Растау үшін <b>{monthActionDraft.monthId}</b> деп жазыңыз</span>
                <input
                  autoFocus
                  value={monthDeleteConfirmation}
                  onChange={(event) =>
                    setMonthDeleteConfirmation(event.target.value.trim())
                  }
                  placeholder={monthActionDraft.monthId}
                  autoComplete="off"
                />
              </label>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={saving}
                onClick={() => {
                  setMonthActionDraft(null);
                  setMonthDeleteConfirmation("");
                }}
              >
                Болдырмау
              </button>
              <button
                className={
                  monthActionDraft.type === "delete"
                    ? "danger-confirm-button"
                    : "primary-button"
                }
                disabled={
                  saving ||
                  (monthActionDraft.type === "delete" &&
                    monthDeleteConfirmation !== monthActionDraft.monthId)
                }
              >
                {saving
                  ? "Орындалып жатыр…"
                  : monthActionDraft.type === "reset"
                    ? "Төлемдерді сброс жасау"
                    : "Айды толық өшіру"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {employeeDraft && (
        <Modal title={employeeDraft.employeeId ? "Қызметкерді өзгерту" : "Жаңа қызметкер"} subtitle={`${data.selectedMonth.label} айлық деректері`} onClose={() => setEmployeeDraft(null)} wide>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("saveEmployee", employeeDraft as unknown as Record<string, unknown>); }}>
            {employeeDraft.employeeId && <p className="modal-note">Айлыққа енгізілген өзгеріс тек {data.selectedMonth.label} есебіне әсер етеді. Егер төленген сома өзгерсе, «Төленді» белгісі автоматты түрде алынады.</p>}
            <div className="form-grid">
              <label className="span-two"><span>Аты-жөні</span><input required value={employeeDraft.fullName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, fullName: event.target.value })} placeholder="Қызметкердің толық аты" /></label>
              <label className="span-two"><span>Лауазымы</span><input value={employeeDraft.position} onChange={(event) => setEmployeeDraft({ ...employeeDraft, position: event.target.value })} placeholder="Мысалы: Мұғалім, куратор немесе менеджер" /></label>
              <label><span>Бөлім</span><select required value={employeeDraft.departmentId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, departmentId: event.target.value })}>{data.departments.filter((department) => !department.archivedAt).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label><span>Төлем түрі</span><select required value={employeeDraft.paymentMethodId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, paymentMethodId: event.target.value })}>{data.paymentMethods.filter((method) => !method.archivedAt).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
              <label className="span-two"><span>Негізгі айлық</span><MoneyInput ariaLabel="Негізгі айлық" value={employeeDraft.baseSalary} onChange={(baseSalary) => setEmployeeDraft({ ...employeeDraft, baseSalary })} /></label>
            </div>
            <div className="components-editor">
              <div className="components-title"><div><strong>Қосымша төлемдер мен ұсталымдар</strong><small>ПС немесе басқа компоненттерді қосыңыз</small></div><button type="button" className="small-add" onClick={() => setEmployeeDraft({ ...employeeDraft, components: [...employeeDraft.components, { id: crypto.randomUUID(), name: employeeDraft.departmentId === "dept-teachers" ? "ПС" : "", kind: "addition", amount: 0 }] })}><Plus size={16} /> Компонент</button></div>
              {employeeDraft.components.map((component, index) => (
                <div className="component-row" key={component.id}>
                  <input aria-label="Компонент атауы" required value={component.name} placeholder="Мысалы: ПС" onChange={(event) => { const next = [...employeeDraft.components]; next[index] = { ...component, name: event.target.value }; setEmployeeDraft({ ...employeeDraft, components: next }); }} />
                  <select aria-label="Компонент түрі" value={component.kind} onChange={(event) => { const next = [...employeeDraft.components]; next[index] = { ...component, kind: event.target.value as "addition" | "deduction" }; setEmployeeDraft({ ...employeeDraft, components: next }); }}><option value="addition">Қосымша</option><option value="deduction">Ұсталым</option></select>
                  <MoneyInput ariaLabel="Компонент сомасы" value={component.amount} onChange={(amount) => { const next = [...employeeDraft.components]; next[index] = { ...component, amount }; setEmployeeDraft({ ...employeeDraft, components: next }); }} />
                  <button type="button" className="icon-button danger" onClick={() => setEmployeeDraft({ ...employeeDraft, components: employeeDraft.components.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16} /></button>
                </div>
              ))}
              {!employeeDraft.components.length && <p className="component-empty">Қосымша төлем немесе ұсталым жоқ.</p>}
            </div>
            <div className="salary-preview"><span>Жалпы есептелген айлық</span><strong>{formatMoney(salaryTotal(employeeDraft.baseSalary, employeeDraft.components))}</strong></div>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEmployeeDraft(null)}>Болдырмау</button><button className="primary-button" disabled={saving}>{saving ? "Сақталуда…" : "Сақтау"}</button></div>
          </form>
        </Modal>
      )}

      {oneTimeExpenseDraft && (
        <Modal
          title={oneTimeExpenseDraft.id ? "Шығынды өзгерту" : "Жаңа шығын"}
          subtitle="Басқа шығындар"
          onClose={() => setOneTimeExpenseDraft(null)}
        >
          <form className="modal-form" onSubmit={(event) => void submitOneTimeExpense(event)}>
            <p className="modal-note">
              Категория автоматты түрде «Басқа шығындар» болады. Бұл бір реттік
              жазба сақталған бойда осы айда жұмсалған сомаға қосылады және
              келесі айға көшірілмейді.
            </p>
            <label>
              <span>Шығын атауы</span>
              <input
                autoFocus
                required
                value={oneTimeExpenseDraft.name}
                onChange={(event) =>
                  setOneTimeExpenseDraft({
                    ...oneTimeExpenseDraft,
                    name: event.target.value,
                  })
                }
                placeholder="Мысалы: Парта немесе орындық сатып алу"
              />
            </label>
            <label>
              <span>Сома</span>
              <MoneyInput
                ariaLabel="Басқа шығын сомасы"
                value={oneTimeExpenseDraft.amount}
                onChange={(amount) =>
                  setOneTimeExpenseDraft({ ...oneTimeExpenseDraft, amount })
                }
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setOneTimeExpenseDraft(null)}>Болдырмау</button>
              <button
                className="primary-button"
                disabled={
                  saving ||
                  !oneTimeExpenseDraft.name.trim() ||
                  oneTimeExpenseDraft.amount <= 0
                }
              >
                {saving ? "Сақталуда…" : oneTimeExpenseDraft.id ? "Сақтау" : "Реестрге қосу"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {expenseDraft && (
        <Modal title={expenseDraft.id ? "Шығынды өзгерту" : "Жаңа шығын"} onClose={() => setExpenseDraft(null)}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("saveExpense", expenseDraft as unknown as Record<string, unknown>); }}>
            <label><span>Шығын атауы</span><input required value={expenseDraft.name} onChange={(event) => setExpenseDraft({ ...expenseDraft, name: event.target.value })} placeholder="Мысалы: Кеңсе арендасы" /></label>
            <label><span>Категория</span><select required value={expenseDraft.categoryId} onChange={(event) => setExpenseDraft({ ...expenseDraft, categoryId: event.target.value })}>{data.expenseCategories.filter((category) => !category.archivedAt).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label><span>Сома</span><MoneyInput ariaLabel="Шығын сомасы" value={expenseDraft.amount} onChange={(amount) => setExpenseDraft({ ...expenseDraft, amount })} /></label>
            <label className="check-label"><input type="checkbox" checked={expenseDraft.isRecurring} onChange={(event) => setExpenseDraft({ ...expenseDraft, isRecurring: event.target.checked })} /><span><b>Әр ай сайын қайталанады</b><small>Жаңа айға автоматты көшіріледі</small></span></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setExpenseDraft(null)}>Болдырмау</button><button className="primary-button" disabled={saving}>{saving ? "Сақталуда…" : "Сақтау"}</button></div>
          </form>
        </Modal>
      )}

      {entityDraft && (
        <Modal title={`${entityDraft.id ? "Атауын өзгерту" : "Жаңа"}: ${entityDraft.type === "department" ? "бөлім" : entityDraft.type === "method" ? "төлем түрі" : "категория"}`} onClose={() => setEntityDraft(null)}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); const action = entityDraft.type === "department" ? "saveDepartment" : entityDraft.type === "method" ? "savePaymentMethod" : "saveExpenseCategory"; void mutate(action, { id: entityDraft.id, name: entityDraft.name }); }}>
            <label><span>Атауы</span><input autoFocus required value={entityDraft.name} onChange={(event) => setEntityDraft({ ...entityDraft, name: event.target.value })} /></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEntityDraft(null)}>Болдырмау</button><button className="primary-button" disabled={saving}>{saving ? "Сақталуда…" : "Сақтау"}</button></div>
          </form>
        </Modal>
      )}

      {passwordOpen && (
        <Modal title="Ортақ парольді өзгерту" subtitle="Қауіпсіздік" onClose={() => { setPasswordOpen(false); setPasswordDraft(""); }}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("changePassword", { password: passwordDraft }); }}>
            <p className="modal-note">Кемінде 10 таңба қолданыңыз. Сақтағаннан кейін барлық құрылғыда қайта кіру керек болады.</p>
            <label><span>Жаңа пароль</span><input autoFocus required minLength={10} type="password" autoComplete="new-password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setPasswordOpen(false)}>Болдырмау</button><button className="primary-button" disabled={saving || passwordDraft.length < 10}>{saving ? "Өзгертілуде…" : "Парольді өзгерту"}</button></div>
          </form>
        </Modal>
      )}

      {importRows && (
        <Modal title={`${currentDepartment?.name ?? "Бөлім"}: импорт`} subtitle="Excel / CSV алдын ала тексеру" onClose={() => setImportRows(null)} extraWide>
          <div className="import-content">
            <p className="import-note">
              Excel ішінен аты-жөні бар кесте автоматты табылады. Негізгі айлық,
              жалпы сома және бөлек төлем бағандары теңге ретінде танылады.
              Табылған қорытындының барлығы қызметкердің негізгі айлығы болып
              сақталады. Импортқа дейін барлық жолды тексеріңіз.
            </p>
            <div className="import-summary"><span><FileSpreadsheet size={20} /> {importRows.length} адам</span><span>Айлық қоры: <strong>{formatMoney(importRows.reduce((sum, row) => sum + importRowTotal(row), 0))}</strong></span><strong className={importRows.some((row) => row.error) ? "has-errors" : ""}>{importRows.filter((row) => row.error).length} қате</strong></div>
            <div className="import-table">
              <div><b>Қызметкер</b><b>Лауазым</b><b>Негізгі айлық</b><b>Жалпы сома</b><b>Төлем түрі</b><b>Статус</b></div>
              {importRows.slice(0, 100).map((row, index) => (
                <div key={`${row.fullName}-${index}`} className={row.error ? "error-row" : ""}>
                  <strong>{row.fullName || "—"}</strong>
                  <span>{row.position || "—"}</span>
                  <span className="import-money">{formatMoney(row.baseSalary || 0)}</span>
                  <strong className="import-money import-total">{formatMoney(importRowTotal(row))}</strong>
                  <span>{row.paymentMethod || "—"}</span>
                  <span>{row.error ?? (row.isPaid ? "Төленді" : "Дайын")}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions"><button className="ghost-button" onClick={() => setImportRows(null)}>Болдырмау</button><button className="primary-button" disabled={saving || importRows.some((row) => row.error)} onClick={() => void mutate("importEmployees", { rows: importRows, departmentId: selectedDepartment })}>{saving ? "Импортталуда…" : `${importRows.length} қызметкерді импорттау`}</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
