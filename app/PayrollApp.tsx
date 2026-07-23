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
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Trash2,
  Upload,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import type {
  BreakdownItem,
  PayrollData,
  SalaryComponent,
  SalaryRecord,
} from "@/lib/types";
import { salaryTotal } from "@/lib/calculations";

type View = "dashboard" | "departments" | "expenses" | "settings";
type EntityType = "department" | "method" | "category";

const CURRENCY = new Intl.NumberFormat("kk-KZ", {
  style: "currency",
  currency: "KZT",
  maximumFractionDigits: 0,
});

function formatMoney(value: number): string {
  return CURRENCY.format(value).replace("KZT", "₸");
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("kk-KZ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function columnValue(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const values = new Map(
    Object.entries(row).map(([key, value]) => [normalizedHeader(key), value]),
  );
  for (const alias of aliases) {
    const value = values.get(normalizedHeader(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function parseDelimitedRows(content: string): Record<string, unknown>[] {
  const source = content.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort(
    (left, right) =>
      firstLine.split(right).length - firstLine.split(left).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  const headers = (rows.shift() ?? []).map((header) => header.trim());
  return rows.map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, cells[index]?.trim() ?? ""]),
    ),
  );
}

function parseMoneyValue(value: unknown): number {
  if (typeof value === "number") return Math.round(value);
  const source = String(value ?? "").trim();
  if (!source) return 0;
  const normalized = source
    .replace(/\u00a0/g, "")
    .replace(/[^\d-]/g, "");
  if (!normalized || normalized === "-") return Number.NaN;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function parsePaidValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return ["true", "иә", "да", "төленді", "оплачено", "+"].includes(
    String(value ?? "").trim().toLocaleLowerCase("kk-KZ"),
  );
}

const MONTH_IMPORT_HEADERS = [
  ["Қаңтар", "Январь"],
  ["Ақпан", "Февраль"],
  ["Наурыз", "Март"],
  ["Сәуір", "Апрель"],
  ["Мамыр", "Май"],
  ["Маусым", "Июнь"],
  ["Шілде", "Июль"],
  ["Тамыз", "Август"],
  ["Қыркүйек", "Сентябрь"],
  ["Қазан", "Октябрь"],
  ["Қараша", "Ноябрь"],
  ["Желтоқсан", "Декабрь"],
];

function normalizePaymentMethod(value: unknown, fallback: string): string {
  const method = String(value ?? "").trim();
  const normalized = method.toLocaleLowerCase("kk-KZ").replace(/\s+/g, " ");
  if (!normalized || normalized === "/+пс") return fallback;
  if (normalized.includes("официально") && normalized.includes("ип")) {
    return "Ресми + ЖК";
  }
  if (normalized === "официально") return "Ресми";
  if (normalized === "ип") return "ЖК";
  if (normalized.includes("самозанят")) return "Өзін-өзі жұмыспен қамтыған";
  if (normalized.includes("перевод")) return "Аударым";
  return method;
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "wide" : ""}`}
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

type ImportRow = {
  department: string;
  fullName: string;
  position: string;
  baseSalary: number;
  ps: number;
  paymentMethod: string;
  isPaid: boolean;
  error?: string;
};

export function PayrollApp() {
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<PayrollData | null>(null);
  const [month, setMonth] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeDraft | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [monthDraft, setMonthDraft] = useState("");
  const [entityDraft, setEntityDraft] = useState<{
    type: EntityType;
    id?: string;
    name: string;
  } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

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

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    if (!data) return;
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
        return;
      }
      const result = (await response.json()) as PayrollData & {
        error?: string;
        signedOut?: boolean;
      };
      if (!response.ok) throw new Error(result.error ?? "Әрекет орындалмады.");
      if (result.signedOut) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.reload();
        return;
      }
      setData(result);
      setMonth(result.selectedMonth.id);
      setEmployeeDraft(null);
      setExpenseDraft(null);
      setEntityDraft(null);
      setImportRows(null);
      setMonthDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Әрекет орындалмады.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  const currentDepartment = data?.departments.find(
    (department) => department.id === selectedDepartment,
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

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !data) return;
    try {
      const fileBuffer = await file.arrayBuffer();
      const isCsv = file.name.toLocaleLowerCase("kk-KZ").endsWith(".csv");
      let rawRows: Record<string, unknown>[];
      if (isCsv) {
        rawRows = parseDelimitedRows(
          new TextDecoder("utf-8").decode(fileBuffer),
        );
      } else {
        const [headerRow = [], ...sheetRows] = await readSheet(fileBuffer);
        const headers = headerRow.map((cell) => String(cell ?? "").trim());
        rawRows = sheetRows
          .filter((row) =>
            row.some((cell) => String(cell ?? "").trim() !== ""),
          )
          .map((row) =>
            Object.fromEntries(
              headers.map((header, index) => [
                header,
                row[index] ?? "",
              ]),
            ),
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
      const selectedMonthHeaders =
        MONTH_IMPORT_HEADERS[data.selectedMonth.month - 1] ?? [];
      const existing = new Set(
        data.salaries.map(
          (salary) =>
            `${salary.departmentName.toLocaleLowerCase("kk-KZ")}:${salary.employeeName.toLocaleLowerCase("kk-KZ")}`,
        ),
      );
      const seen = new Set<string>();
      const rows = rawRows.map((row) => {
        const department =
          String(
            columnValue(row, ["Бөлім", "Отдел"]) ||
              currentDepartment?.name ||
              "",
          ).trim();
        const fullName = String(
          columnValue(row, [
            "Қызметкер",
            "ФИО",
            "Аты-жөні",
            "Сотрудник",
            "Имя",
          ]),
        ).trim();
        const position = String(
          columnValue(row, ["Лауазым", "Должность", "Қызметі"]),
        ).trim();
        const paymentMethod = normalizePaymentMethod(
          columnValue(row, [
            "Төлем түрі",
            "Төлем форматы",
            "Способ оплаты",
            "Оплата",
          ]),
          fallbackMethod,
        );
        const baseSalary = parseMoneyValue(
          columnValue(row, [
            "Негізгі айлық",
            "Айлық",
            "Сумма",
            "Общий зп",
            "Жалпы айлық",
            "ЗП",
            "Зарплата",
            ...selectedMonthHeaders,
          ]),
        );
        const ps = parseMoneyValue(columnValue(row, ["ПС"]));
        const isPaid = parsePaidValue(
          columnValue(row, ["Төленді", "Төленген", "Оплачено"]),
        );
        const key = `${department.toLocaleLowerCase("kk-KZ")}:${fullName.toLocaleLowerCase("kk-KZ")}`;
        let rowError = "";
        if (!department || !fullName || !paymentMethod) rowError = "Міндетті бағандар бос.";
        else if (!knownDepartments.has(department.toLocaleLowerCase("kk-KZ"))) rowError = "Белгісіз бөлім.";
        else if (!knownMethods.has(paymentMethod.toLocaleLowerCase("kk-KZ"))) rowError = "Белгісіз төлем түрі.";
        else if (!Number.isFinite(baseSalary) || baseSalary < 0 || !Number.isFinite(ps) || ps < 0) rowError = "Сома дұрыс емес.";
        else if (existing.has(key)) rowError = "Бұл қызметкер осы айда бар.";
        else if (seen.has(key)) rowError = "Файлда қайталанған жол.";
        seen.add(key);
        return {
          department,
          fullName,
          position,
          paymentMethod,
          baseSalary,
          ps,
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">A</div>
          <div><strong>Айлық</strong><span>Қаржылық дашборд</span></div>
        </div>
        <nav aria-label="Негізгі бөлімдер">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <LayoutDashboard size={19} /><span>Дашборд</span>
          </button>
          <button className={view === "departments" ? "active" : ""} onClick={() => setView("departments")}>
            <UsersRound size={19} /><span>Бөлімдер</span>
          </button>
          <button className={view === "expenses" ? "active" : ""} onClick={() => setView("expenses")}>
            <ReceiptText size={19} /><span>Шығындар</span>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
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
              {view === "settings" && "Баптаулар"}
            </h1>
            <p>{data.selectedMonth.label} бойынша есеп</p>
          </div>
          <div className="topbar-actions">
            <label className="month-select">
              <CalendarDays size={17} />
              <select
                aria-label="Есептік ай"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  void load(event.target.value);
                }}
              >
                {data.months.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
            <button className="secondary-button" onClick={() => setMonthDraft(data.selectedMonth.id)}>
              <Plus size={17} /> Жаңа ай
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
              <KpiCard
                label="Операциялық шығын"
                value={data.stats.expenseTotal}
                icon={<ReceiptText size={21} />}
                detail={`${data.expenses.length} шығын жазбасы`}
                change={changePercent(data.stats.expenseTotal, previous?.expenseTotal)}
                tone="plain"
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
                  <button className="text-button" onClick={() => setView("departments")}>Толық көру</button>
                </div>
                <BreakdownBars items={data.departmentBreakdown} emptyText="Қызметкерлер қосылғанда бөлімдер статистикасы шығады." />
              </article>
            </section>

            <section className="dashboard-grid lower">
              <article className="panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Шығындар</span><h2>Категориялар бойынша</h2></div>
                  <button className="text-button" onClick={() => setView("expenses")}>Шығын қосу</button>
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
                  onClick={() => setSelectedDepartment(department.id)}
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
                      <button className="secondary-button" onClick={() => importInput.current?.click()}><Upload size={17} /> Импорт</button>
                      <input ref={importInput} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void readImport(event)} />
                      <button className="primary-button" onClick={newEmployee}><Plus size={17} /> Қызметкер қосу</button>
                    </div>
                  </div>
                  {filteredEmployees.length ? (
                    <div className="data-table employee-table">
                      <div className="table-head"><span>Қызметкер</span><span>Төлем түрі</span><span>Негізгі айлық</span><span>Қосымша</span><span>Жалпы сома</span><span>Төленді</span><span /></div>
                      {filteredEmployees.map((employee) => (
                        <div className={`table-row ${employee.archivedAt ? "archived-row" : ""}`} key={employee.id}>
                          <span className="person-cell"><i>{employee.employeeName.slice(0, 1).toUpperCase()}</i><span><b>{employee.employeeName}</b>{employee.position && <small>{employee.position}</small>}</span>{employee.archivedAt && <em>Архив</em>}</span>
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
                            {!employee.archivedAt && <button onClick={() => window.confirm(`${employee.employeeName} архивке жіберілсін бе?`) && void mutate("archiveEmployee", { employeeId: employee.employeeId })} aria-label="Архивтеу"><Archive size={16} /></button>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={<UsersRound size={25} />} title="Қызметкерлер жоқ" text="Осы бөлімге бірінші қызметкерді қосыңыз немесе Excel файлын импорттаңыз." action={<button className="primary-button" onClick={newEmployee}><Plus size={17} /> Қызметкер қосу</button>} />
                  )}
                </section>
              </>
            ) : <EmptyState icon={<Building2 size={25} />} title="Бөлім жоқ" text="Баптаулардан бірінші бөлімді қосыңыз." />}
          </div>
        )}

        {view === "expenses" && (
          <div className="page-content">
            <section className="expense-hero">
              <div><span className="eyebrow">Операциялық бюджет</span><strong>{formatMoney(data.stats.expenseTotal)}</strong><p>Айлықтан бөлек барлық шығын</p></div>
              <div><span>Төленген шығын</span><strong>{formatMoney(data.expenses.filter((expense) => expense.isPaid).reduce((sum, expense) => sum + expense.amount, 0))}</strong></div>
              <button className="primary-button light" onClick={() => setExpenseDraft({ name: "", categoryId: data.expenseCategories.find((category) => !category.archivedAt)?.id ?? "", amount: 0, isRecurring: true })}><Plus size={18} /> Шығын қосу</button>
            </section>
            <section className="panel table-panel">
              <div className="table-toolbar">
                <div><span className="eyebrow">Шығындар тізімі</span><h2>{data.selectedMonth.label}</h2></div>
                <span className="count-chip">{data.expenses.length} жазба</span>
              </div>
              {data.expenses.length ? (
                <div className="data-table expense-table">
                  <div className="table-head"><span>Шығын</span><span>Категория</span><span>Қайталанады</span><span>Сома</span><span>Төленді</span><span /></div>
                  {data.expenses.map((expense) => (
                    <div className="table-row" key={expense.id}>
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
              ) : (
                <EmptyState icon={<ReceiptText size={25} />} title="Шығындар жоқ" text="Аренда, интернет немесе басқа операциялық шығынды қосыңыз." action={<button className="primary-button" onClick={() => setExpenseDraft({ name: "", categoryId: data.expenseCategories.find((category) => !category.archivedAt)?.id ?? "", amount: 0, isRecurring: true })}><Plus size={17} /> Шығын қосу</button>} />
              )}
            </section>
          </div>
        )}

        {view === "settings" && (
          <div className="page-content settings-grid">
            <section className="panel settings-panel">
              <div className="panel-heading"><div><span className="eyebrow">Құрылым</span><h2>Бөлімдер</h2></div><button className="small-add" onClick={() => setEntityDraft({ type: "department", name: "" })}><Plus size={16} /> Қосу</button></div>
              <div className="settings-list">
                {data.departments.map((department) => (
                  <div key={department.id}><span><i><Building2 size={17} /></i><b>{department.name}</b>{department.archivedAt && <em>Архив</em>}</span><span className="settings-actions"><button onClick={() => setEntityDraft({ type: "department", id: department.id, name: department.name })}><Pencil size={15} /></button>{!department.archivedAt && <button onClick={() => window.confirm(`${department.name} архивтелсін бе?`) && void mutate("archiveDepartment", { id: department.id })}><Archive size={15} /></button>}</span></div>
                ))}
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="panel-heading"><div><span className="eyebrow">Анықтамалық</span><h2>Төлем түрлері</h2></div><button className="small-add" onClick={() => setEntityDraft({ type: "method", name: "" })}><Plus size={16} /> Қосу</button></div>
              <div className="settings-list">
                {data.paymentMethods.map((method) => (
                  <div key={method.id}><span><i><WalletCards size={17} /></i><b>{method.name}</b>{method.isSystem && <em>Дайын</em>}{method.archivedAt && <em>Архив</em>}</span><span className="settings-actions"><button onClick={() => setEntityDraft({ type: "method", id: method.id, name: method.name })}><Pencil size={15} /></button>{!method.archivedAt && <button onClick={() => window.confirm(`${method.name} архивтелсін бе?`) && void mutate("archivePaymentMethod", { id: method.id })}><Archive size={15} /></button>}</span></div>
                ))}
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="panel-heading"><div><span className="eyebrow">Шығындар</span><h2>Категориялар</h2></div><button className="small-add" onClick={() => setEntityDraft({ type: "category", name: "" })}><Plus size={16} /> Қосу</button></div>
              <div className="settings-list">
                {data.expenseCategories.map((category) => (
                  <div key={category.id}><span><i><ReceiptText size={17} /></i><b>{category.name}</b>{category.archivedAt && <em>Архив</em>}</span><span className="settings-actions"><button onClick={() => setEntityDraft({ type: "category", id: category.id, name: category.name })}><Pencil size={15} /></button>{!category.archivedAt && <button onClick={() => window.confirm(`${category.name} архивтелсін бе?`) && void mutate("archiveExpenseCategory", { id: category.id })}><Archive size={15} /></button>}</span></div>
                ))}
              </div>
            </section>
            <section className="panel security-panel">
              <div className="security-icon"><CheckCircle2 size={24} /></div>
              <div><span className="eyebrow">Қауіпсіздік</span><h2>Ортақ пароль</h2><p>Пароль өзгертілгенде барлық ашық сессия жабылады.</p></div>
              <button className="secondary-button" onClick={() => setPasswordOpen(true)}>Парольді өзгерту</button>
            </section>
          </div>
        )}
      </main>

      {monthDraft && (
        <Modal title="Жаңа есептік ай" subtitle="Алдыңғы айды көшіру" onClose={() => setMonthDraft("")}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("createMonth", { newMonthId: monthDraft }); }}>
            <p className="modal-note">Белсенді қызметкерлер, айлықтар, қосымшалар және қайталанатын шығындар көшіріледі. Төлем белгілері жаңадан басталады.</p>
            <label><span>Жаңа ай</span><input required type="month" value={monthDraft} min="2020-01" max="2100-12" onChange={(event) => setMonthDraft(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setMonthDraft("")}>Болдырмау</button><button className="primary-button" disabled={saving || data.months.some((item) => item.id === monthDraft)}>{saving ? "Көшіріліп жатыр…" : "Айды құру"}</button></div>
          </form>
        </Modal>
      )}

      {employeeDraft && (
        <Modal title={employeeDraft.employeeId ? "Қызметкерді өзгерту" : "Жаңа қызметкер"} subtitle="Айлық деректері" onClose={() => setEmployeeDraft(null)} wide>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("saveEmployee", employeeDraft as unknown as Record<string, unknown>); }}>
            <div className="form-grid">
              <label className="span-two"><span>Аты-жөні</span><input required value={employeeDraft.fullName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, fullName: event.target.value })} placeholder="Қызметкердің толық аты" /></label>
              <label className="span-two"><span>Лауазымы</span><input value={employeeDraft.position} onChange={(event) => setEmployeeDraft({ ...employeeDraft, position: event.target.value })} placeholder="Мысалы: Мұғалім, куратор немесе менеджер" /></label>
              <label><span>Бөлім</span><select required value={employeeDraft.departmentId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, departmentId: event.target.value })}>{data.departments.filter((department) => !department.archivedAt).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label><span>Төлем түрі</span><select required value={employeeDraft.paymentMethodId} onChange={(event) => setEmployeeDraft({ ...employeeDraft, paymentMethodId: event.target.value })}>{data.paymentMethods.filter((method) => !method.archivedAt).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
              <label className="span-two"><span>Негізгі айлық</span><div className="amount-input"><input required min={0} type="number" value={employeeDraft.baseSalary} onChange={(event) => setEmployeeDraft({ ...employeeDraft, baseSalary: Number(event.target.value) })} /><b>₸</b></div></label>
            </div>
            <div className="components-editor">
              <div className="components-title"><div><strong>Қосымша төлемдер мен ұсталымдар</strong><small>ПС немесе басқа компоненттерді қосыңыз</small></div><button type="button" className="small-add" onClick={() => setEmployeeDraft({ ...employeeDraft, components: [...employeeDraft.components, { id: crypto.randomUUID(), name: employeeDraft.departmentId === "dept-teachers" ? "ПС" : "", kind: "addition", amount: 0 }] })}><Plus size={16} /> Компонент</button></div>
              {employeeDraft.components.map((component, index) => (
                <div className="component-row" key={component.id}>
                  <input aria-label="Компонент атауы" required value={component.name} placeholder="Мысалы: ПС" onChange={(event) => { const next = [...employeeDraft.components]; next[index] = { ...component, name: event.target.value }; setEmployeeDraft({ ...employeeDraft, components: next }); }} />
                  <select aria-label="Компонент түрі" value={component.kind} onChange={(event) => { const next = [...employeeDraft.components]; next[index] = { ...component, kind: event.target.value as "addition" | "deduction" }; setEmployeeDraft({ ...employeeDraft, components: next }); }}><option value="addition">Қосымша</option><option value="deduction">Ұсталым</option></select>
                  <div className="amount-input"><input aria-label="Компонент сомасы" required min={0} type="number" value={component.amount} onChange={(event) => { const next = [...employeeDraft.components]; next[index] = { ...component, amount: Number(event.target.value) }; setEmployeeDraft({ ...employeeDraft, components: next }); }} /><b>₸</b></div>
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

      {expenseDraft && (
        <Modal title={expenseDraft.id ? "Шығынды өзгерту" : "Жаңа шығын"} onClose={() => setExpenseDraft(null)}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void mutate("saveExpense", expenseDraft as unknown as Record<string, unknown>); }}>
            <label><span>Шығын атауы</span><input required value={expenseDraft.name} onChange={(event) => setExpenseDraft({ ...expenseDraft, name: event.target.value })} placeholder="Мысалы: Кеңсе арендасы" /></label>
            <label><span>Категория</span><select required value={expenseDraft.categoryId} onChange={(event) => setExpenseDraft({ ...expenseDraft, categoryId: event.target.value })}>{data.expenseCategories.filter((category) => !category.archivedAt).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label><span>Сома</span><div className="amount-input"><input required min={0} type="number" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: Number(event.target.value) })} /><b>₸</b></div></label>
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
        <Modal title={`${currentDepartment?.name ?? "Бөлім"}: импорт`} subtitle="Excel / CSV алдын ала тексеру" onClose={() => setImportRows(null)} wide>
          <div className="import-content">
            <div className="import-summary"><span><FileSpreadsheet size={20} /> {importRows.length} адам</span><span>Айлық қоры: <strong>{formatMoney(importRows.reduce((sum, row) => sum + row.baseSalary + row.ps, 0))}</strong></span><strong className={importRows.some((row) => row.error) ? "has-errors" : ""}>{importRows.filter((row) => row.error).length} қате</strong></div>
            <div className="import-table">
              <div><b>Қызметкер</b><b>Лауазым</b><b>Айлық</b><b>ПС</b><b>Төлем түрі</b><b>Статус</b></div>
              {importRows.slice(0, 100).map((row, index) => (
                <div key={`${row.fullName}-${index}`} className={row.error ? "error-row" : ""}><span>{row.fullName || "—"}</span><span>{row.position || "—"}</span><span>{formatMoney(row.baseSalary || 0)}</span><span>{formatMoney(row.ps || 0)}</span><span>{row.paymentMethod || "—"}</span><span>{row.error ?? (row.isPaid ? "Төленді" : "Дайын")}</span></div>
              ))}
            </div>
            <div className="modal-actions"><button className="ghost-button" onClick={() => setImportRows(null)}>Болдырмау</button><button className="primary-button" disabled={saving || importRows.some((row) => row.error)} onClick={() => void mutate("importEmployees", { rows: importRows, departmentId: selectedDepartment })}>{saving ? "Импортталуда…" : `${importRows.length} қызметкерді импорттау`}</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
