<script setup lang="ts">
import { ArrowDownToLine, ChevronDown, History, RotateCcw, Search, Sparkles, X } from "lucide-vue-next";
import { ASSIGNMENT_LABELS, BANK_LABELS, KIND_LABELS, RECON_LABELS, detectCity, needsAssignment, type BankAssignment, type BankOperation, type BankProject, type BankRule } from "../../lib/bank";
import type { BankStatementInfo } from "../../lib/bank-database";

/** Operations of the month. The project filter is shared with the project cards above. */
const props = defineProps<{ operations: BankOperation[]; projects: BankProject[]; statements: BankStatementInfo[]; colorOf: (id: string) => string }>();
const project = defineModel<string>("project", { default: "all" });
const emit = defineEmits<{ rule: [draft: Partial<BankRule>] }>();
const bank = useBank();
const { t } = useLocale();
const NONE = "__none", WAITING = "__waiting";

const type = ref<"all" | "sale" | "refund" | "other">("all");
const search = ref("");
const inProject = (o: BankOperation) => project.value === "all" || (project.value === WAITING ? needsAssignment(o) : project.value === NONE ? o.assignment === "excluded" : o.projectId === project.value);
const ofType = (o: BankOperation) => type.value === "all" || (type.value === "sale" ? o.kind === "sale" || o.kind === "settlement" : type.value === "refund" ? o.kind === "refund" : !["sale", "settlement", "refund"].includes(o.kind));
const rows = computed(() => {
  const q = search.value.trim().toLocaleLowerCase("ru-RU");
  return props.operations.filter(o => inProject(o) && ofType(o)
    && (!q || [o.purpose, o.address, o.counterparty, o.operationNo, o.transactionNo, o.comment, o.legalEntity, o.channel, o.paymentMethod, String(Math.abs(o.amount))].join(" ").toLocaleLowerCase("ru-RU").includes(q)));
});
const countIn = (value: string) => props.operations.filter(o => value === "all" || (value === WAITING ? needsAssignment(o) : value === NONE ? o.assignment === "excluded" : o.projectId === value)).length;
const page = ref(1);
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 50)));
const shown = computed(() => rows.value.slice((page.value - 1) * 50, page.value * 50));
watch([project, type, search], () => { page.value = 1; });
const totals = computed(() => ({
  turnover: rows.value.filter(o => o.kind === "sale" || o.kind === "settlement").reduce((a, o) => a + o.amount, 0),
  commission: rows.value.reduce((a, o) => a + o.commission, 0),
}));

// Selection and bulk decisions
const selected = ref(new Set<string>());
const allShownSelected = computed(() => shown.value.length > 0 && shown.value.every(o => selected.value.has(o.id)));
function toggle(id: string) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next; }
function toggleShown() { selected.value = allShownSelected.value ? new Set() : new Set(shown.value.map(o => o.id)); }
const bulkProject = ref("");
const busy = ref(false), error = ref("");
async function run(action: () => Promise<unknown>) {
  busy.value = true; error.value = "";
  try { await action(); } catch (e) { error.value = messageOf(e, t("Сақтау орындалмады.")); } finally { busy.value = false; }
}
function assignSelected() {
  if (!bulkProject.value) return;
  const ids = [...selected.value];
  run(async () => { await bank.assign(ids, bulkProject.value === NONE ? null : bulkProject.value, "Бірнеше операция қолмен бөлінді"); selected.value = new Set(); bulkProject.value = ""; });
}
function resetSelected() {
  const ids = [...selected.value];
  run(async () => { await bank.resetToRules(ids); selected.value = new Set(); });
}
function assignOne(op: BankOperation, value: string) {
  if (value) run(() => bank.assign([op.id], value === NONE ? null : value, "Қолмен бөлінді"));
}
const whereOf = (op: BankOperation) => { const city = detectCity(op.address); return city ? `${city} · ${op.address}` : op.address || op.channel || op.counterparty; };
const projectValue = (op: BankOperation) => op.projectId ?? (op.assignment === "excluded" ? NONE : "");

// Detail: comment, journal, rule from this operation
const open = ref<string | null>(null);
const comment = ref("");
const journal = ref<Awaited<ReturnType<typeof bank.history>> | null>(null);
function expand(op: BankOperation) {
  open.value = open.value === op.id ? null : op.id;
  comment.value = op.comment;
  journal.value = null;
}
async function loadJournal(op: BankOperation) {
  journal.value = await bank.history(op.id).catch(() => []);
}
function ruleFrom(op: BankOperation) {
  const contract = op.channel.match(/договор\s+(\S+)/)?.[1];
  const draft: Partial<BankRule> = op.address ? { field: "address", pattern: op.address }
    : contract ? { field: "purpose", pattern: contract } : { field: "counterparty", pattern: op.counterparty.slice(0, 60) };
  emit("rule", { ...draft, projectId: op.projectId ?? op.suggestedProjectId ?? null, approved: true });
}
const projectName = (id: string | null) => props.projects.find(p => p.id === id)?.name ?? "—";
const statementName = (id: string) => props.statements.find(s => s.id === id)?.fileName ?? "—";
const day = (iso: string | null) => iso ? iso.split("-").reverse().join(".") : "—";
const journalText = (entry: NonNullable<typeof journal.value>[number]) => {
  if (entry.action === "comment") return `${t("Пікір")}: «${entry.after?.comment ?? ""}»`;
  const describe = (v: Record<string, unknown> | null) => v ? `${v.projectId ? projectName(String(v.projectId)) : t(ASSIGNMENT_LABELS[v.assignment as BankAssignment] ?? "—")}` : "—";
  return `${describe(entry.before)} → ${describe(entry.after)}${entry.note ? ` · ${entry.note}` : ""}`;
};

// Export of the filtered list
const exportFields: [string, (o: BankOperation) => string | number | null][] = [
  ["Күні", o => day(o.date)], ["Уақыты", o => o.time], ["Шотқа түскен күні", o => day(o.creditedDate)], ["Банк", o => BANK_LABELS[o.bank]],
  ["Заңды тұлға", o => o.legalEntity], ["БСН/ЖСН", o => o.legalEntityBin], ["Шот", o => o.account], ["Түрі", o => t(KIND_LABELS[o.kind])],
  ["Сомасы, ₸", o => o.amount], ["Комиссия, ₸", o => o.commission], ["ҚҚС (комиссияда)", o => o.vat], ["Салық", o => o.tax],
  ["Төлем тәсілі", o => o.paymentMethod], ["Арна", o => o.channel], ["Қала", o => detectCity(o.address) ?? ""], ["Мекенжай", o => o.address], ["Мақсаты / детальдары", o => o.purpose],
  ["Контрагент", o => o.counterparty], ["Операция №", o => o.operationNo], ["Транзакция №", o => o.transactionNo],
  ["Жоба", o => o.projectId ? projectName(o.projectId) : ""], ["Бөлу күйі", o => t(ASSIGNMENT_LABELS[o.assignment])], ["Сверка", o => t(RECON_LABELS[o.reconStatus])],
  ["Пікір", o => o.comment], ["Дереккөз файлы", o => statementName(o.statementId)],
];
function exportCsv() {
  // Neutralize spreadsheet formula injection in text taken from bank files.
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+@-](?!\d)/, "'$&").replaceAll('"', '""')}"`;
  const csv = String.fromCharCode(0xfeff) + [exportFields.map(f => t(f[0])), ...rows.value.map(o => exportFields.map(f => f[1](o)))].map(r => r.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `bank-operations-${bank.period.value}.csv`; a.click();
  URL.revokeObjectURL(url);
}
async function exportExcel() {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const header = exportFields.map(f => ({ value: t(f[0]), fontWeight: "bold" as const }));
  const body = rows.value.map(o => exportFields.map(f => { const v = f[1](o); return v === null || v === "" ? null : { value: v, ...(typeof v === "number" ? { format: "#,##0.00" } : {}) }; }));
  await writeXlsxFile([header, ...body], { fileName: `bank-operations-${bank.period.value}.xlsx`, sheet: t("Операциялар"), stickyRowsCount: 1 });
}
</script>

<template>
  <section class="panel bank-ops">
    <div class="bank-ops-filters">
      <nav class="bank-chips" :aria-label="t('Жоба')">
        <button type="button" :class="{ active: project === 'all' }" @click="project = 'all'">{{ t("Барлығы") }} <b>{{ countIn("all") }}</b></button>
        <button v-for="p in projects" :key="p.id" type="button" :class="{ active: project === p.id }" :style="{ '--chip': colorOf(p.id) }" @click="project = p.id"><i />{{ p.name }} <b>{{ countIn(p.id) }}</b></button>
        <button type="button" class="warn" :class="{ active: project === WAITING }" @click="project = WAITING">{{ t("Бөлу керек") }} <b>{{ countIn(WAITING) }}</b></button>
        <button type="button" :class="{ active: project === NONE }" @click="project = NONE">{{ t("Жобаға қатысы жоқ") }} <b>{{ countIn(NONE) }}</b></button>
      </nav>
      <div class="bank-ops-row">
        <div class="segmented bank-type" role="group" :aria-label="t('Түрі')">
          <button type="button" :class="{ active: type === 'all' }" @click="type = 'all'">{{ t("Барлығы") }}</button>
          <button type="button" :class="{ active: type === 'sale' }" @click="type = 'sale'">{{ t("Түсім") }}</button>
          <button type="button" :class="{ active: type === 'refund' }" @click="type = 'refund'">{{ t("Қайтарым") }}</button>
          <button type="button" :class="{ active: type === 'other' }" @click="type = 'other'">{{ t("Комиссия, басқа") }}</button>
        </div>
        <label class="search-field"><Search :size="16" /><input v-model="search" :placeholder="t('Іздеу: сома, мекенжай, операция №')"></label>
        <div class="ledger-actions"><button class="button secondary" type="button" @click="exportExcel"><ArrowDownToLine :size="16" /> Excel</button><button class="button secondary" type="button" @click="exportCsv"><ArrowDownToLine :size="16" /> CSV</button></div>
      </div>
      <span class="bank-list-head">{{ rows.length }} {{ t("операция") }} · {{ t("түсім") }} {{ money(totals.turnover) }} · комиссия {{ money(totals.commission) }}</span>
    </div>

    <div v-if="selected.size" class="selection-bar active bank-bulk">
      <div><strong>{{ selected.size }} {{ t("таңдалды") }}</strong>
        <select v-model="bulkProject" :aria-label="t('Қай жобаға')"><option value="">{{ t("Жобаны таңдаңыз…") }}</option><option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option><option :value="NONE">{{ t("Жобаға қатысы жоқ") }}</option></select>
        <button type="button" :disabled="!bulkProject || busy" @click="assignSelected">{{ t("Бөлу") }}</button>
        <button type="button" :disabled="busy" @click="resetSelected"><RotateCcw :size="14" /> {{ t("Ережеге қайтару") }}</button>
        <button type="button" @click="selected = new Set()"><X :size="14" /> {{ t("Болдырмау") }}</button>
      </div>
    </div>
    <p v-if="error" class="finance-error" role="alert">{{ error }}</p>

    <div class="table-scroll">
      <table class="bank-table">
        <thead>
          <tr>
            <th><input type="checkbox" :checked="allShownSelected" :aria-label="t('Көрінгеннің бәрін таңдау')" @change="toggleShown"></th>
            <th>{{ t("Күні") }}</th><th class="num">{{ t("Сомасы") }}</th><th class="num">Комиссия</th><th>{{ t("Түрі · тәсілі") }}</th><th>{{ t("Қайдан") }}</th><th>{{ t("Жоба") }}</th><th />
          </tr>
        </thead>
        <tbody>
          <template v-for="op in shown" :key="op.id">
            <tr :class="{ waiting: needsAssignment(op), selected: selected.has(op.id) }">
              <td><input type="checkbox" :checked="selected.has(op.id)" :aria-label="`${op.operationNo} ${t('таңдау')}`" @change="toggle(op.id)"></td>
              <td class="nowrap">{{ day(op.date) }}<small>{{ op.time || (op.creditedDate ? `${t("түсті")} ${day(op.creditedDate)}` : "") }}</small></td>
              <td class="num" :class="{ negative: op.amount < 0 }">{{ money(op.amount) }}</td>
              <td class="num muted">{{ op.commission ? money(op.commission) : "—" }}</td>
              <td>{{ t(KIND_LABELS[op.kind]) }}<small>{{ t(op.paymentMethod) }}{{ op.channel && op.bank === "kaspi" ? ` · ${op.channel}` : "" }}</small></td>
              <td class="where"><span>{{ whereOf(op) }}</span><small>{{ op.legalEntity }} · {{ BANK_LABELS[op.bank] }}</small></td>
              <td>
                <select class="project-select" :value="projectValue(op)" :disabled="busy || op.assignment === 'duplicate'" :aria-label="`${op.operationNo}: ${t('жоба')}`" @change="assignOne(op, ($event.target as HTMLSelectElement).value)">
                  <option value="" disabled>{{ op.suggestedProjectId ? `${t("Ұсыныс")}: ${projectName(op.suggestedProjectId)}` : t("Таңдаңыз…") }}</option>
                  <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                  <option :value="NONE">{{ t("Жобаға қатысы жоқ") }}</option>
                </select>
                <small class="bank-state-text" :class="op.assignment">{{ t(ASSIGNMENT_LABELS[op.assignment]) }}</small>
              </td>
              <td><button class="icon-button" type="button" :aria-expanded="open === op.id" :aria-label="t('Толығырақ')" @click="expand(op)"><ChevronDown :size="16" :class="{ flipped: open === op.id }" /></button></td>
            </tr>
            <tr v-if="open === op.id" class="bank-detail-row">
              <td colspan="8">
                <div class="bank-detail">
                  <dl>
                    <div><dt>{{ t("Мақсаты / детальдары") }}</dt><dd>{{ op.purpose || "—" }}</dd></div>
                    <div><dt>Контрагент</dt><dd>{{ op.counterparty || "—" }}</dd></div>
                    <div><dt>{{ t("Мекенжай") }}</dt><dd>{{ op.address || "—" }}</dd></div>
                    <div><dt>{{ t("Заңды тұлға") }}</dt><dd>{{ op.legalEntity }} · {{ op.legalEntityBin }}{{ op.account ? ` · ${op.account}` : "" }}</dd></div>
                    <div><dt>Операция № / транзакция №</dt><dd>{{ op.operationNo || "—" }} / {{ op.transactionNo || "—" }}</dd></div>
                    <div><dt>{{ t("Комиссия / ҚҚС / салық") }}</dt><dd>{{ money(op.commission) }} / {{ op.vat === null ? "—" : money(op.vat) }} / {{ op.tax === null ? t("көрсетілмеген") : money(op.tax) }}</dd></div>
                    <div><dt>Сверка</dt><dd>{{ t(RECON_LABELS[op.reconStatus]) }}</dd></div>
                    <div><dt>{{ t("Дереккөз") }}</dt><dd>{{ statementName(op.statementId) }}</dd></div>
                  </dl>
                  <div class="bank-detail-side">
                    <label class="form-field"><span>{{ t("Менеджер пікірі") }}</span><textarea v-model="comment" rows="2" maxlength="1000" :placeholder="t('Мысалы: Тамшылаб курсы, чек бойынша расталды')" /></label>
                    <div class="ledger-actions">
                      <button class="button secondary" type="button" :disabled="busy || comment === op.comment" @click="run(() => bank.comment(op.id, comment))">{{ t("Пікірді сақтау") }}</button>
                      <button class="button secondary" type="button" @click="ruleFrom(op)"><Sparkles :size="15" /> {{ t("Осыдан ереже жасау") }}</button>
                      <button v-if="op.assignment === 'manual' || op.assignment === 'excluded'" class="button ghost" type="button" :disabled="busy" @click="run(() => bank.resetToRules([op.id]))"><RotateCcw :size="15" /> {{ t("Ережеге қайтару") }}</button>
                      <button class="button ghost" type="button" @click="loadJournal(op)"><History :size="15" /> Журнал</button>
                    </div>
                    <ul v-if="journal" class="bank-journal">
                      <li v-for="(entry, i) in journal" :key="i"><small>{{ entry.createdAt.slice(0, 16).replace("T", " ") }}</small>{{ journalText(entry) }}</li>
                      <li v-if="!journal.length"><small>{{ t("Өзгеріс болмаған") }}</small></li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-if="!rows.length" class="panel-empty">{{ t("Сүзгі бойынша операция жоқ.") }}</p>
    <footer v-if="pages > 1" class="finance-pagination"><button class="button secondary" type="button" :disabled="page <= 1" @click="page--">{{ t("Алдыңғы") }}</button><span>{{ page }} / {{ pages }}</span><button class="button secondary" type="button" :disabled="page >= pages" @click="page++">{{ t("Келесі") }}</button></footer>
  </section>
</template>
