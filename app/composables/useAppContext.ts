/**
 * Two independent areas:
 * - Analytics (Талдау) always covers all projects for one calendar month.
 * - Payroll operations work inside one project profile (the sidebar switcher) and its opened months.
 * Analytics links into Payroll open the exact project and month there.
 */
export const PAYROLL_ROUTES = new Set(["/departments", "/expenses", "/other-expenses", "/smz", "/settings"]);
export const ANALYTICS_ROUTES = new Set(["/", "/finance", "/unit-economics"]);

export function useAppContext() {
  const payroll = usePayroll();
  const finance = useFinance();
  const period = usePeriod();

  const projects = computed(() => finance.projects.value.length ? finance.projects.value : payroll.data.value?.workspaces.map(w => ({ id: w.id, name: w.name })) ?? []);
  const colorOf = (id: string) => projectColor(projects.value.findIndex(p => p.id === id));
  const nameOf = (id: string) => projects.value.find(p => p.id === id)?.name ?? "";
  /** The payroll profile shown in the sidebar switcher. */
  const workspace = computed(() => payroll.data.value?.selectedWorkspace ?? null);
  const workspaceColor = computed(() => workspace.value ? colorOf(workspace.value.id) : "var(--brand)");

  function selectPeriod(next: string) {
    if (PERIOD_PATTERN.test(next) && next !== period.value) period.value = next;
  }
  /** A report page (analytics) for one project; it never changes the payroll profile. */
  function financeLink(projectId: string, extra: Record<string, string> = {}, hash = "") {
    return `/finance?${new URLSearchParams({ project: projectId, month: period.value, ...extra })}${hash}`;
  }
  /** A payroll page of one project and month; opening it switches the payroll profile to that project. */
  function payrollLink(path: string, projectId: string, hash = "", extra: Record<string, string> = {}) {
    return `${path}?${new URLSearchParams({ workspace: projectId, month: period.value, ...extra })}${hash}`;
  }
  /** Where to fix each data-quality issue for a project. */
  function issueLink(code: string, projectId: string) {
    switch (code) {
      case "no-payroll-month": return payrollLink("/departments", projectId);
      case "unpaid-salary": return payrollLink("/departments", projectId, "#payment-queue");
      case "unpaid-mandatory": return payrollLink("/expenses", projectId);
      case "unpaid-other": return financeLink(projectId, { status: "unpaid" }, "#ledger");
      case "review": case "missing-amount": return financeLink(projectId, { view: "review" }, "#ledger");
      case "other-category": return financeLink(projectId, { category: "other" }, "#ledger");
      case "no-tax": return financeLink(projectId, { category: "tax" }, "#ledger");
      default: return `/unit-economics?month=${period.value}#metrics-${projectId}`;
    }
  }

  return { projects, colorOf, nameOf, period, workspace, workspaceColor, selectPeriod, financeLink, payrollLink, issueLink };
}
