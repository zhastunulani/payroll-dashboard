import type { PayrollData } from "../../lib/types";
import { computeStats } from "../../lib/calculations";

type ApiError = Error & {
  statusCode?: number;
  status?: number;
  data?: { error?: string };
};
type CompactMutationResult = { ok: true; compact: true; signedOut?: boolean };

const optimisticActions = new Set([
  "toggleSalaryPaid",
  "toggleExpensePaid",
  "saveEmployeeNote",
]);

function updateDerivedData(data: PayrollData) {
  data.stats = computeStats(data.salaries, data.expenses);
  for (const department of data.departments) {
    department.total = department.employees.reduce((sum, item) => sum + item.total, 0);
    department.paid = department.employees.reduce(
      (sum, item) => sum + (item.isPaid ? item.total : 0),
      0,
    );
    department.remaining = Math.max(0, department.total - department.paid);
  }
}

function applyOptimisticMutation(
  data: PayrollData,
  action: string,
  payload: Record<string, unknown>,
): boolean {
  const id = String(payload.id ?? "");
  if (action === "toggleSalaryPaid") {
    const paid = Boolean(payload.isPaid);
    const paidAt = paid ? new Date().toISOString() : null;
    let found = false;
    for (const salary of data.salaries) {
      if (salary.id !== id) continue;
      salary.isPaid = paid;
      salary.paidAt = paidAt;
      found = true;
    }
    for (const department of data.departments) {
      for (const salary of department.employees) {
        if (salary.id !== id) continue;
        salary.isPaid = paid;
        salary.paidAt = paidAt;
      }
    }
    if (found) updateDerivedData(data);
    return found;
  }
  if (action === "toggleExpensePaid") {
    const expense = data.expenses.find((item) => item.id === id);
    if (!expense) return false;
    expense.isPaid = Boolean(payload.isPaid);
    expense.paidAt = expense.isPaid ? new Date().toISOString() : null;
    updateDerivedData(data);
    return true;
  }
  if (action === "saveEmployeeNote") {
    const note = String(payload.note ?? "").trim();
    let found = false;
    for (const salary of data.salaries) {
      if (salary.id === id) {
        salary.note = note;
        found = true;
      }
    }
    for (const department of data.departments) {
      for (const salary of department.employees) {
        if (salary.id === id) salary.note = note;
      }
    }
    return found;
  }
  return false;
}

export function usePayroll() {
  const data = useState<PayrollData | null>("payroll:data", () => null);
  const authenticated = useState<boolean | null>("payroll:auth", () => null);
  const loading = useState("payroll:loading", () => false);
  const saving = useState("payroll:saving", () => false);
  const pendingMutations = useState<string[]>("payroll:pending-mutations", () => []);
  const loadSequence = useState("payroll:load-sequence", () => 0);
  const error = useState("payroll:error", () => "");
  const workspaceId = useState("payroll:workspace", () => "");

  async function load(monthId?: string, nextWorkspaceId?: string) {
    const requestId = ++loadSequence.value;
    loading.value = true;
    error.value = "";
    try {
      const activeWorkspace = nextWorkspaceId ?? workspaceId.value;
      let result: PayrollData | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await $fetch<PayrollData>("/api/payroll", {
            query: {
              ...(monthId ? { month: monthId } : {}),
              ...(activeWorkspace ? { workspace: activeWorkspace } : {}),
            },
            credentials: "include",
          });
          break;
        } catch (caught) {
          const apiError = caught as ApiError;
          const status = apiError.statusCode ?? apiError.status;
          const retryable = status === undefined || status >= 500;
          if (!retryable || attempt === 2) throw caught;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          if (requestId !== loadSequence.value) return;
        }
      }
      if (!result || requestId !== loadSequence.value) return;
      data.value = result;
      authenticated.value = true;
      workspaceId.value = result.selectedWorkspace.id;
      if (import.meta.client) localStorage.setItem("payroll-workspace", workspaceId.value);
    } catch (caught) {
      if (requestId !== loadSequence.value) return;
      const apiError = caught as ApiError;
      if (apiError.statusCode === 401 || apiError.status === 401) {
        authenticated.value = false;
        data.value = null;
      } else {
        authenticated.value = true;
        error.value = apiError.data?.error
          || "Деректерді жүктеу уақытша мүмкін болмады. Қайта көріңіз.";
      }
    } finally {
      if (requestId === loadSequence.value) loading.value = false;
    }
  }

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    if (!data.value) return false;
    const mutationKey = `${action}:${String(payload.id ?? "global")}`;
    if (pendingMutations.value.includes(mutationKey)) return false;
    const previousData = optimisticActions.has(action)
      ? JSON.parse(JSON.stringify(data.value)) as PayrollData
      : null;
    const optimistic = applyOptimisticMutation(data.value, action, payload);
    if (optimistic) {
      pendingMutations.value = [...pendingMutations.value, mutationKey];
    } else {
      saving.value = true;
    }
    error.value = "";
    try {
      const result = await $fetch<PayrollData | CompactMutationResult>("/api/payroll", {
        method: "POST",
        credentials: "include",
        body: {
          action,
          workspaceId: data.value.selectedWorkspace.id,
          monthId: data.value.selectedMonth.id,
          ...payload,
        },
      });
      if ("signedOut" in result && result.signedOut) {
        authenticated.value = false;
        data.value = null;
        return false;
      }
      if (!("compact" in result)) {
        data.value = result;
        workspaceId.value = result.selectedWorkspace.id;
      }
      return true;
    } catch (caught) {
      const apiError = caught as ApiError & { data?: { error?: string } };
      if (apiError.statusCode === 401 || apiError.status === 401) {
        authenticated.value = false;
        data.value = null;
      } else {
        error.value = apiError.data?.error || apiError.message || "Әрекет орындалмады.";
      }
      if (previousData) data.value = previousData;
      return false;
    } finally {
      if (optimistic) {
        pendingMutations.value = pendingMutations.value.filter(
          (item) => item !== mutationKey,
        );
      } else {
        saving.value = false;
      }
    }
  }

  async function logout() {
    await $fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    authenticated.value = false;
    data.value = null;
  }

  async function switchWorkspace(id: string) {
    if (id === workspaceId.value) return;
    await load(undefined, id);
  }

  function isPending(action: string, id?: string): boolean {
    return pendingMutations.value.includes(`${action}:${id ?? "global"}`);
  }

  if (import.meta.client && !workspaceId.value) {
    workspaceId.value = localStorage.getItem("payroll-workspace") || "";
  }

  return {
    data,
    authenticated,
    loading,
    saving,
    error,
    workspaceId,
    load,
    mutate,
    isPending,
    switchWorkspace,
    logout,
  };
}
