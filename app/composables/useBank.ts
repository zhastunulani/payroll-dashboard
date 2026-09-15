import type { BankCode, BankRule } from "../../lib/bank";
import type { BankData, BankUploadResult } from "../../lib/bank-database";

/** Bank statements: one month of operations for all projects, plus uploads, rules and CRM totals. */
export function useBank() {
  const data = useState<BankData | null>("bank:data", () => null);
  const loading = useState("bank:loading", () => false);
  const error = useState("bank:error", () => "");
  const period = usePeriod();
  let sequence = 0;

  async function load() {
    const current = ++sequence;
    loading.value = true;
    try {
      const next = await $fetch<BankData>("/api/bank", { query: { period: period.value } });
      if (current === sequence) { data.value = next; error.value = ""; }
    } catch (e) {
      if (current === sequence) error.value = messageOf(e, "Банк деректері жүктелмеді.");
    } finally {
      if (current === sequence) loading.value = false;
    }
  }

  async function post<T = { ok: true; changed?: number }>(body: Record<string, unknown>): Promise<T> {
    return $fetch<T>("/api/bank", { method: "POST", body });
  }

  async function readFile(file: File) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  async function upload(bank: BankCode, file: File, commit: boolean, force = false) {
    const result = await post<BankUploadResult>({ action: commit ? "import" : "preview", bank, fileName: file.name, data: await readFile(file), force });
    if (commit) await load();
    return result;
  }
  async function act(body: Record<string, unknown>) {
    const result = await post(body);
    await load();
    return result;
  }

  return {
    data, loading, error, period, load, upload,
    assign: (ids: string[], projectId: string | null, note = "") => act({ action: "assign", ids, projectId, note }),
    resetToRules: (ids: string[]) => act({ action: "resetToRules", ids }),
    assignGroup: (ids: string[], projectId: string | null, rule: Pick<BankRule, "field" | "pattern"> | null) => act({ action: "assignGroup", ids, projectId, rule }),
    applyRules: () => act({ action: "applyRules" }),
    comment: (id: string, comment: string) => act({ action: "comment", id, comment }),
    saveRule: (rule: Partial<BankRule>) => act({ action: "saveRule", rule }),
    deleteRule: (id: string) => act({ action: "deleteRule", id }),
    deleteStatement: (id: string) => act({ action: "deleteStatement", id }),
    saveCrm: (workspaceId: string, source: "amocrm" | "crm_eduser", deals: number | null, amount: number | null) =>
      act({ action: "crm", workspaceId, period: period.value, source, deals, amount }),
    history: (id: string) => $fetch<{ action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string; createdAt: string }[]>("/api/bank", { query: { history: id } }),
  };
}

export function messageOf(error: unknown, fallback: string) {
  const e = error as { data?: { message?: string }; statusMessage?: string; message?: string };
  return e?.data?.message || e?.statusMessage || e?.message || fallback;
}
