<script setup lang="ts">
import { ArrowUpRight, Check, CheckCircle2, Clock3, Megaphone, Pencil, Plus, ReceiptText, Search, ShoppingBag, Trash2, WalletCards, X } from "lucide-vue-next";
import { classifyFinanceCost, entryKind, FINANCE_CATEGORIES, type FinanceEntry } from "../../lib/finance";
import type { FinanceData } from "../../lib/finance-database";
import type { ExpenseRecord } from "../../lib/types";

const payroll = usePayroll();
const route = useRoute();
const { formatMoney } = useFormatters();
const { t } = useLocale();

/** Two kinds of expenses: mandatory monthly payments (paid or not yet) and one-time spending (already spent). */
const tab = ref<"mandatory" | "other">(route.query.tab === "other" ? "other" : "mandatory");
watch(() => route.query.tab, value => { tab.value = value === "other" ? "other" : "mandatory"; });
const status = ref<"all" | "unpaid" | "paid">("all");
const search = ref("");
const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const editExpense = ref<ExpenseRecord | null>(null);
const formOpen = ref(false);
const subscriptionMode = ref(false);
const oneTimeForm = ref(false);

const expenses = computed(() => payroll.data.value?.expenses ?? []);
const mandatory = computed(() => expenses.value.filter(item => !item.isOneTime));
const oneTime = computed(() => expenses.value.filter(item => item.isOneTime));
const mandatoryTotal = computed(() => mandatory.value.reduce((sum, item) => sum + item.amount, 0));
const mandatoryPaid = computed(() => mandatory.value.filter(item => item.isPaid).reduce((sum, item) => sum + item.amount, 0));
const unpaidCount = computed(() => mandatory.value.filter(item => !item.isPaid).length);
const oneTimeTotal = computed(() => oneTime.value.reduce((sum, item) => sum + item.amount, 0));

// Spending recorded outside Payroll for this project and month (Excel imports, manual report entries),
// so this page shows the same «Басқа шығындар» and «Таргет» totals as the reports.
const ledger = ref<FinanceEntry[]>([]);
watch(() => [payroll.data.value?.selectedWorkspace.id, payroll.data.value?.selectedMonth.id] as const, async ([workspace, month]) => {
  if (!workspace || !month) return;
  try {
    const data = await $fetch<FinanceData>("/api/finance", { query: { period: month, months: 1 } });
    ledger.value = data.entries.filter(e => e.workspaceId === workspace && e.origin !== "salary" && e.origin !== "expense"
      && e.disposition === "included" && e.basis === "actual" && e.amount !== null);
  } catch {
    ledger.value = [];
  }
}, { immediate: true });
const ledgerOther = computed(() => ledger.value.filter(e => entryKind(e) === "other").sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)));
const ledgerTarget = computed(() => ledger.value.filter(e => entryKind(e) === "target").sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)));
const ledgerOtherTotal = computed(() => ledgerOther.value.reduce((sum, e) => sum + (e.amount ?? 0), 0));
// Same rule as the reports: a one-time purchase classified as marketing counts as target spend.
const oneTimeMarketing = computed(() => oneTime.value.filter(e => classifyFinanceCost(e.name, e.categoryName) === "marketing").reduce((sum, e) => sum + e.amount, 0));
const targetTotal = computed(() => ledgerTarget.value.reduce((sum, e) => sum + (e.amount ?? 0), 0) + oneTimeMarketing.value);
const otherTotal = computed(() => oneTimeTotal.value - oneTimeMarketing.value + ledgerOtherTotal.value);
const reportLink = (kind: string) => `/finance?${new URLSearchParams({ project: payroll.data.value?.selectedWorkspace.id ?? "", month: payroll.data.value?.selectedMonth.id ?? "", kind })}#ledger`;

const query = computed(() => search.value.trim().toLocaleLowerCase("kk-KZ"));
const filtered = computed(() => mandatory.value.filter(item =>
  (status.value === "all" || (status.value === "paid") === item.isPaid)
  && (!query.value || `${item.name} ${item.categoryName} ${item.departmentName || ""}`.toLocaleLowerCase("kk-KZ").includes(query.value)),
));
/** Grouped by category (Аренда, Интернет, Подписка…), unpaid first inside each group. */
const categoryGroups = computed(() => {
  const map = new Map<string, { name: string; rows: ExpenseRecord[]; total: number; unpaid: number }>();
  for (const item of filtered.value) {
    const group = map.get(item.categoryName) ?? { name: item.categoryName, rows: [], total: 0, unpaid: 0 };
    group.rows.push(item);
    group.total += item.amount;
    if (!item.isPaid) group.unpaid += item.amount;
    map.set(item.categoryName, group);
  }
  return [...map.values()].map(g => ({ ...g, rows: g.rows.sort((a, b) => Number(a.isPaid) - Number(b.isPaid) || b.amount - a.amount) })).sort((a, b) => b.total - a.total);
});
const oneTimeRows = computed(() => oneTime.value.filter(item => !query.value || item.name.toLocaleLowerCase("kk-KZ").includes(query.value)).sort((a, b) => b.amount - a.amount));

const selected = computed(() => mandatory.value.filter(item => selectedIds.value.has(item.id)));
const allSelected = computed(() => !!filtered.value.length && filtered.value.every(item => selectedIds.value.has(item.id)));
function toggle(id: string) { const next = new Set(selectedIds.value); if (next.has(id)) next.delete(id); else next.add(id); selectedIds.value = next; }
function toggleAll() { selectionMode.value = true; selectedIds.value = allSelected.value ? new Set() : new Set(filtered.value.map(item => item.id)); }
function closeSelection() { selectionMode.value = false; selectedIds.value = new Set(); }
async function setPaid(value: boolean) { if (await payroll.mutate("setExpensePaidBulk", { ids: selected.value.map(item => item.id), isPaid: value })) closeSelection(); }
async function removeSelected() { if (selected.value.length && confirm(`${selected.value.length} ${t("төлем толық өшіріледі. Жалғастыру керек пе?")}`) && await payroll.mutate("deleteExpensesBulk", { ids: selected.value.map(item => item.id) })) closeSelection(); }
async function remove(expense: ExpenseRecord) { if (confirm(`${expense.name} ${t("өшірілсін бе?")}`)) await payroll.mutate("deleteExpense", { id: expense.id }); }
function openForm(expense: ExpenseRecord | null = null) { editExpense.value = expense; subscriptionMode.value = false; oneTimeForm.value = false; formOpen.value = true; }
function openSubscription() { editExpense.value = null; subscriptionMode.value = true; oneTimeForm.value = false; formOpen.value = true; }
function openOneTime(expense: ExpenseRecord) { editExpense.value = expense; subscriptionMode.value = false; oneTimeForm.value = true; formOpen.value = true; }
function selectTab(next: "mandatory" | "other") {
  tab.value = next;
  closeSelection();
  navigateTo({ query: { ...route.query, tab: next === "other" ? "other" : undefined } }, { replace: true });
}

// Quick add for one-time spending: name + amount, Enter.
const quickName = ref("");
const quickAmount = ref<number | null>(null);
async function addOneTime() {
  if (!quickName.value.trim() || !quickAmount.value || quickAmount.value <= 0) return;
  if (await payroll.mutate("saveOneTimeExpense", { name: quickName.value.trim(), amount: quickAmount.value })) {
    quickName.value = "";
    quickAmount.value = null;
  }
}
</script>

<template>
  <div v-if="payroll.data.value" class="page expenses-page">
    <section class="exp-summary">
      <button type="button" class="panel exp-card" :class="{ active: tab === 'mandatory' }" @click="selectTab('mandatory')">
        <header><span class="exp-icon mandatory"><ReceiptText :size="18" /></span>{{ t("Міндетті төлемдер") }}</header>
        <strong>{{ formatMoney(mandatoryTotal) }}</strong>
        <span class="meter"><i :style="{ width: `${mandatoryTotal ? mandatoryPaid / mandatoryTotal * 100 : 0}%` }" /></span>
        <small v-if="unpaidCount" class="owed">{{ t("Төленді") }} {{ formatMoney(mandatoryPaid) }} · {{ t("қалды") }} {{ formatMoney(mandatoryTotal - mandatoryPaid) }} ({{ unpaidCount }} {{ t("төлем") }})</small>
        <small v-else-if="mandatory.length" class="done">{{ t("Барлығы төленді") }}</small>
        <small v-else>{{ t("Аренда, интернет, подписка — әлі енгізілмеген") }}</small>
      </button>
      <button type="button" class="panel exp-card" :class="{ active: tab === 'other' }" @click="selectTab('other')">
        <header><span class="exp-icon other"><ShoppingBag :size="18" /></span>{{ t("Басқа шығындар") }}</header>
        <strong>{{ formatMoney(otherTotal) }}</strong>
        <small>{{ oneTime.length + ledgerOther.length }} {{ t("жазба") }} · {{ t("бірден жұмсалды") }}</small>
      </button>
      <NuxtLink :to="reportLink('target')" class="panel exp-card">
        <header><span class="exp-icon target"><Megaphone :size="18" /></span>{{ t("Таргет (Facebook)") }}</header>
        <strong>{{ formatMoney(targetTotal) }}</strong>
        <small>{{ t("Жұмсалды") }} · {{ t("толығы есепте") }} <ArrowUpRight :size="12" /></small>
      </NuxtLink>
      <div class="panel exp-card static">
        <header><span class="exp-icon total"><WalletCards :size="18" /></span>{{ t("Шығындар барлығы") }}</header>
        <strong>{{ formatMoney(mandatoryTotal + otherTotal + targetTotal) }}</strong>
        <small>{{ t("Айлықтан бөлек") }} · {{ monthName(payroll.data.value.selectedMonth) }}</small>
      </div>
    </section>

    <div class="segmented exp-tabs" role="tablist" :aria-label="t('Шығын түрі')">
      <button type="button" role="tab" :aria-selected="tab === 'mandatory'" :class="{ active: tab === 'mandatory' }" @click="selectTab('mandatory')">{{ t("Міндетті төлемдер") }} <b>{{ mandatory.length }}</b></button>
      <button type="button" role="tab" :aria-selected="tab === 'other'" :class="{ active: tab === 'other' }" @click="selectTab('other')">{{ t("Басқа шығындар") }} <b>{{ oneTime.length + ledgerOther.length }}</b></button>
    </div>

    <section v-if="tab === 'mandatory'" class="panel table-panel exp-panel">
      <header class="table-toolbar">
        <div><span class="eyebrow">{{ t("Ай сайынғы міндеттемелер") }}</span><h2>{{ t("Міндетті төлемдер") }}</h2><p>{{ t("Әр ай төленуі керек. «Ай сайын» белгісі барлары жаңа айға көшіріледі.") }}</p></div>
        <div class="toolbar-actions">
          <label class="search-field"><Search :size="17" /><input v-model="search" :placeholder="t('Атауы, категориясы немесе бөлімі')" /></label>
          <button class="button secondary" type="button" @click="openSubscription"><Plus :size="17" /> {{ t("Подписка қосу") }}</button>
          <button class="button primary" type="button" @click="openForm()"><Plus :size="17" /> {{ t("Төлем қосу") }}</button>
        </div>
      </header>
      <div class="exp-filterbar">
        <div class="segmented pay-status" role="group" :aria-label="t('Төлем күйі')">
          <button type="button" :class="{ active: status === 'all' }" @click="status = 'all'">{{ t("Барлығы") }} <b>{{ mandatory.length }}</b></button>
          <button type="button" :class="{ active: status === 'unpaid' }" @click="status = 'unpaid'">{{ t("Төленбеген") }} <b>{{ unpaidCount }}</b></button>
          <button type="button" :class="{ active: status === 'paid' }" @click="status = 'paid'">{{ t("Төленген") }} <b>{{ mandatory.length - unpaidCount }}</b></button>
        </div>
        <button v-if="!selectionMode && mandatory.length" class="button subtle" type="button" @click="toggleAll"><CheckCircle2 :size="16" /> {{ t("Таңдау") }}</button>
      </div>
      <div v-if="selectionMode" class="selection-bar active">
        <div><label><input type="checkbox" :checked="allSelected" @change="toggleAll" /> {{ allSelected ? t("Барлығы таңдалды") : t("Барлығын таңдау") }}</label><button type="button" @click="closeSelection"><X :size="15" /> {{ t("Аяқтау") }}</button></div>
        <div v-if="selected.length"><strong>{{ selected.length }} {{ t("таңдалды") }}</strong><button type="button" @click="setPaid(true)"><CheckCircle2 :size="15" /> {{ t("Төленді") }}</button><button type="button" @click="setPaid(false)"><Clock3 :size="15" /> {{ t("Төленбеді") }}</button><button type="button" class="danger" @click="removeSelected"><Trash2 :size="15" /> {{ t("Өшіру") }}</button></div>
        <span v-else>{{ t("Қажетті төлемдерді белгілеңіз") }}</span>
      </div>

      <div v-if="categoryGroups.length" class="exp-groups">
        <div v-for="group in categoryGroups" :key="group.name" class="exp-group">
          <div class="exp-group-head"><span>{{ group.name }}</span><b>{{ formatMoney(group.total) }}</b><small v-if="group.unpaid" class="owed">{{ t("қалды") }} {{ formatMoney(group.unpaid) }}</small><small v-else class="done">{{ t("төленді") }}</small></div>
          <div v-for="expense in group.rows" :key="expense.id" class="exp-row" :class="{ paid: expense.isPaid, selected: selectedIds.has(expense.id), selecting: selectionMode }">
            <label v-if="selectionMode" class="row-check"><input type="checkbox" :checked="selectedIds.has(expense.id)" @change="toggle(expense.id)" /></label>
            <div class="expense-name"><span><ReceiptText :size="18" /></span><div><strong>{{ expense.name }}</strong><small>{{ expense.departmentName || t("Жалпы") }}</small></div></div>
            <span :class="expense.isRecurring ? 'recurring-tag' : 'once-tag'">{{ expense.isRecurring ? t("Ай сайын") : t("Осы ай ғана") }}</span>
            <strong class="pay-amount">{{ formatMoney(expense.amount) }}</strong>
            <button type="button" class="status-toggle pay-toggle" :class="{ paid: expense.isPaid }" :disabled="payroll.isPending('toggleExpensePaid', expense.id)" @click="payroll.mutate('toggleExpensePaid', { id: expense.id, isPaid: !expense.isPaid })"><i><Check v-if="expense.isPaid" :size="13" /></i>{{ expense.isPaid ? t("Төленді") : t("Төлеу") }}</button>
            <div class="row-actions"><button type="button" :aria-label="t('Өзгерту')" @click="openForm(expense)"><Pencil :size="16" /></button><button type="button" class="danger" :aria-label="t('Өшіру')" @click="remove(expense)"><Trash2 :size="16" /></button></div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state"><span><ReceiptText :size="25" /></span><strong>{{ mandatory.length ? t("Сүзгі бойынша төлем жоқ") : t("Міндетті төлемдер жоқ") }}</strong><p>{{ t("Аренда, интернет немесе подписканы қосыңыз.") }}</p><button class="button primary" type="button" @click="openForm()"><Plus :size="17" /> {{ t("Төлем қосу") }}</button></div>
    </section>

    <section v-else class="panel exp-panel">
      <header class="table-toolbar">
        <div><span class="eyebrow">{{ t("Бір реттік") }}</span><h2>{{ t("Басқа шығындар") }}</h2><p>{{ t("Сатып алулар мен бір реттік шығындар — бірден жұмсалған болып есептеледі және келесі айға көшірілмейді.") }}</p></div>
        <label class="search-field"><Search :size="17" /><input v-model="search" :placeholder="t('Шығын атауын іздеу')" /></label>
      </header>
      <form class="quick-add" @submit.prevent="addOneTime">
        <input v-model="quickName" :aria-label="t('Не алынды')" :placeholder="t('Не алынды? Мысалы: кеңсе орындығы')" maxlength="120" required>
        <div class="money-input"><input v-model.number="quickAmount" :aria-label="t('Сома')" type="number" min="1" step="1" :placeholder="t('Сома')" required><b>₸</b></div>
        <button class="button primary" :disabled="payroll.saving.value"><Plus :size="17" /> {{ payroll.saving.value ? t("Қосылуда…") : t("Қосу") }}</button>
      </form>
      <div v-if="oneTimeRows.length" class="registry-list">
        <article v-for="(expense, index) in oneTimeRows" :key="expense.id"><span class="registry-number">{{ String(index + 1).padStart(2, "0") }}</span><div><strong>{{ expense.name }}</strong><small>{{ t("Басқа шығындар") }} · {{ t("жұмсалды") }}</small></div><b>{{ formatMoney(expense.amount) }}</b><span class="row-actions"><button type="button" :aria-label="t('Өзгерту')" @click="openOneTime(expense)"><Pencil :size="16" /></button><button type="button" class="danger" :aria-label="t('Өшіру')" @click="remove(expense)"><Trash2 :size="16" /></button></span></article>
      </div>
      <div v-else-if="!ledgerOther.length" class="empty-state compact"><span><ShoppingBag :size="25" /></span><strong>{{ t("Бұл айда бір реттік шығын жоқ") }}</strong><p>{{ t("Жоғарыдағы жолға атауы мен сомасын жазып, «Қосу» басыңыз.") }}</p></div>
      <div v-if="ledgerOther.length" class="ledger-block">
        <div class="exp-group-head"><span>{{ t("Есепке енгізілген басқа шығындар") }}</span><b>{{ formatMoney(ledgerOtherTotal) }}</b><NuxtLink :to="reportLink('other')" class="text-button">{{ t("Есепте өзгерту") }} <ArrowUpRight :size="13" /></NuxtLink></div>
        <div v-for="e in ledgerOther" :key="e.id" class="ledger-row"><div><strong>{{ e.name }}</strong><small>{{ t(FINANCE_CATEGORIES[e.category]) }} · {{ e.origin === "import" ? t("Excel импорт") : t("Қолмен") }}</small></div><b>{{ formatMoney(e.amount ?? 0) }}</b></div>
      </div>
    </section>
  </div>
  <ExpenseForm v-if="formOpen" :expense="editExpense" :subscription="subscriptionMode" :one-time="oneTimeForm" @close="formOpen = false" @saved="formOpen = false" />
</template>
