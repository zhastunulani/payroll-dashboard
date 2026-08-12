import type { PayrollData } from "../../lib/types";

type ApiError = Error & { statusCode?: number; status?: number };

export function usePayroll() {
  const data = useState<PayrollData | null>("payroll:data", () => null);
  const authenticated = useState<boolean | null>("payroll:auth", () => null);
  const loading = useState("payroll:loading", () => false);
  const saving = useState("payroll:saving", () => false);
  const error = useState("payroll:error", () => "");
  const workspaceId = useState("payroll:workspace", () => "");

  async function load(monthId?: string, nextWorkspaceId?: string) {
    loading.value = true;
    error.value = "";
    try {
      const activeWorkspace = nextWorkspaceId ?? workspaceId.value;
      data.value = await $fetch<PayrollData>("/api/payroll", {
        query: {
          ...(monthId ? { month: monthId } : {}),
          ...(activeWorkspace ? { workspace: activeWorkspace } : {}),
        },
        credentials: "include",
      });
      authenticated.value = true;
      workspaceId.value = data.value.selectedWorkspace.id;
      if (import.meta.client) localStorage.setItem("payroll-workspace", workspaceId.value);
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.statusCode === 401 || apiError.status === 401) {
        authenticated.value = false;
        data.value = null;
      } else {
        authenticated.value = true;
        error.value = apiError.message || "Деректер жүктелмеді.";
      }
    } finally {
      loading.value = false;
    }
  }

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    if (!data.value) return false;
    saving.value = true;
    error.value = "";
    try {
      const result = await $fetch<PayrollData & { signedOut?: boolean }>("/api/payroll", {
        method: "POST",
        credentials: "include",
        body: {
          action,
          workspaceId: data.value.selectedWorkspace.id,
          monthId: data.value.selectedMonth.id,
          ...payload,
        },
      });
      if (result.signedOut) {
        authenticated.value = false;
        data.value = null;
        return false;
      }
      data.value = result;
      workspaceId.value = result.selectedWorkspace.id;
      return true;
    } catch (caught) {
      const apiError = caught as ApiError & { data?: { error?: string } };
      if (apiError.statusCode === 401 || apiError.status === 401) {
        authenticated.value = false;
        data.value = null;
      } else {
        error.value = apiError.data?.error || apiError.message || "Әрекет орындалмады.";
      }
      return false;
    } finally {
      saving.value = false;
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

  if (import.meta.client && !workspaceId.value) {
    workspaceId.value = localStorage.getItem("payroll-workspace") || "";
  }

  return { data, authenticated, loading, saving, error, workspaceId, load, mutate, switchWorkspace, logout };
}
