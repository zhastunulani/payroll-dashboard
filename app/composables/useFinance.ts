import {
  consolidateFinance,
  EMPTY_FINANCE_METRICS,
  financeIssues,
  summarizeFinance,
  type FinanceEntry,
  type FinanceIssue,
  type FinanceMetrics,
  type FinanceSummary,
  type FinanceTrendPoint,
} from "../../lib/finance";
import type { FinanceData } from "../../lib/finance-database";

/** Categorical slots in fixed order; a project keeps its color because it follows the project's sort order. */
export const PROJECT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const GROUP_COLORS = { payroll: "#2a78d6", marketing: "#eb6834", opex: "#1baf7a", tax: "#eda100", capex: "#e87ba4" } as const;

const MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const MONTHS_SHORT = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"];

export function periodLabel(period: string, short = false): string {
  const [year, month] = period.split("-").map(Number);
  const name = (short ? MONTHS_SHORT : MONTHS)[month! - 1] ?? period;
  return short ? name : `${year} ж. ${name}`;
}

export function shiftPeriod(period: string, offset: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7);
const PERIOD_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

const NUMBER = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const clean = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

export function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${clean(NUMBER.format(Math.round(value)))} ₸`;
}
export function compactMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${clean(DECIMAL.format(value / 1_000_000))} млн ₸`;
  if (abs >= 10_000) return `${clean(NUMBER.format(value / 1000))} мың ₸`;
  return money(value);
}
export function formatCount(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return clean(new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value));
}
export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${clean(new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value * 100))}%`;
}
/** Unsigned size of a relative change; beyond ±999% a multiple reads better than a percentage. */
export function formatDelta(value: number): string {
  const abs = Math.abs(value);
  return abs > 9.99 ? `×${formatCount(abs + 1, 0)}` : formatPercent(abs, abs >= 1 ? 0 : 1);
}
/** Relative change; null when there is no comparable base. */
export function relativeChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function errorMessage(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message || (e as Error)?.message || "Қате орын алды.";
}

export function useFinance() {
  const route = useRoute();
  const payroll = usePayroll();
  const queryPeriod = typeof route.query.period === "string" && PERIOD_PATTERN.test(route.query.period) ? route.query.period : "";
  const period = useState("finance:period", () => queryPeriod || currentPeriod());
  if (queryPeriod && queryPeriod !== period.value) period.value = queryPeriod;
  const data = useState<FinanceData | null>("finance:data", () => null);
  const loading = useState("finance:loading", () => false);
  const error = useState("finance:error", () => "");
  const sequence = useState("finance:sequence", () => 0);

  async function load() {
    const id = ++sequence.value;
    loading.value = true;
    error.value = "";
    try {
      const result = await $fetch<FinanceData>("/api/finance", { query: { period: period.value } });
      if (id === sequence.value) data.value = result;
    } catch (e) {
      if (id !== sequence.value) return;
      if ((e as { statusCode?: number }).statusCode === 401) payroll.authenticated.value = false;
      error.value = errorMessage(e);
    } finally {
      if (id === sequence.value) loading.value = false;
    }
  }

  function setPeriod(next: string) {
    if (!PERIOD_PATTERN.test(next) || next === period.value) return;
    period.value = next;
    navigateTo({ query: { ...route.query, period: next } }, { replace: true });
    load();
  }

  async function post(body: Record<string, unknown>) {
    try {
      await $fetch("/api/finance", { method: "POST", body });
      await load();
      return "";
    } catch (e) {
      return errorMessage(e);
    }
  }

  const projects = computed(() => data.value?.projects ?? []);
  const fresh = computed(() => data.value?.period === period.value);
  const entriesOf = (projectId: string) => data.value?.entries.filter(e => e.workspaceId === projectId) ?? [];
  const metricsOf = (projectId: string): FinanceMetrics => data.value?.metrics[projectId] ?? EMPTY_FINANCE_METRICS;
  const summaries = computed<Record<string, FinanceSummary>>(() => Object.fromEntries(
    projects.value.map(p => [p.id, summarizeFinance(entriesOf(p.id), metricsOf(p.id))]),
  ));
  const total = computed(() => consolidateFinance(projects.value.map(p => ({ entries: entriesOf(p.id), metrics: metricsOf(p.id) }))));
  const closed = computed(() => period.value < currentPeriod());
  const issues = computed<Record<string, FinanceIssue[]>>(() => Object.fromEntries(projects.value.map(p => [
    p.id,
    financeIssues(summaries.value[p.id]!, metricsOf(p.id), { payrollMonth: !!data.value?.payrollMonths[p.id]?.includes(period.value), closed: closed.value }),
  ])));
  const trendOf = (projectId: string): FinanceTrendPoint[] => data.value?.trend[projectId] ?? [];
  const previousOf = (projectId: string): FinanceTrendPoint | null => {
    const points = trendOf(projectId);
    return points.length > 1 ? points[points.length - 2]! : null;
  };
  const colorOf = (projectId: string) => PROJECT_COLORS[Math.max(0, projects.value.findIndex(p => p.id === projectId)) % PROJECT_COLORS.length]!;
  const nameOf = (projectId: string) => projects.value.find(p => p.id === projectId)?.name ?? projectId;

  return {
    period, data, loading, error, fresh, projects, summaries, total, issues, closed,
    load, setPeriod, entriesOf, metricsOf, trendOf, previousOf, colorOf, nameOf,
    saveEntry: (entry: Partial<FinanceEntry>) => post({ action: "entry", entry }),
    deleteEntry: (entry: FinanceEntry) => post({ action: "deleteEntry", id: entry.id, updatedAt: entry.updatedAt }),
    saveMetrics: (workspaceId: string, metrics: FinanceMetrics) => post({ action: "metrics", workspaceId, period: period.value, metrics, version: data.value?.metricVersions[workspaceId] ?? null }),
    classify: (entry: FinanceEntry, behavior: string) => post({ action: "classification", workspaceId: entry.workspaceId, period: entry.period, id: entry.id, behavior }),
  };
}
