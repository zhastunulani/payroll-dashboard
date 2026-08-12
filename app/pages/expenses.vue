<script setup lang="ts">
import { Check, CheckCircle2, Clock3, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-vue-next";
import type { ExpenseRecord } from "../../lib/types";

const payroll = usePayroll();
const { formatMoney } = useFormatters();
const search = ref("");
const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const editExpense = ref<ExpenseRecord | null>(null);
const formOpen = ref(false);
const rows = computed(() => payroll.data.value?.expenses.filter(item => !item.isOneTime) || []);
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase("kk-KZ");
  return query ? rows.value.filter(item => `${item.name} ${item.categoryName}`.toLocaleLowerCase("kk-KZ").includes(query)) : rows.value;
});
const total = computed(() => rows.value.reduce((sum, item) => sum + item.amount, 0));
const paid = computed(() => rows.value.filter(item => item.isPaid).reduce((sum, item) => sum + item.amount, 0));
const selected = computed(() => rows.value.filter(item => selectedIds.value.has(item.id)));
const allSelected = computed(() => !!rows.value.length && rows.value.every(item => selectedIds.value.has(item.id)));
function openForm(expense: ExpenseRecord | null = null) { editExpense.value = expense; formOpen.value = true; }
function toggle(id: string) { const next = new Set(selectedIds.value); if (next.has(id)) next.delete(id); else next.add(id); selectedIds.value = next; }
function toggleAll() { selectionMode.value = true; selectedIds.value = allSelected.value ? new Set() : new Set(rows.value.map(item => item.id)); }
function closeSelection() { selectionMode.value = false; selectedIds.value = new Set(); }
async function setPaid(value: boolean) { if (await payroll.mutate("setExpensePaidBulk", { ids: selected.value.map(item => item.id), isPaid: value })) closeSelection(); }
async function removeSelected() { if (selected.value.length && confirm(`${selected.value.length} шығын толық өшіріледі. Жалғастыру керек пе?`) && await payroll.mutate("deleteExpensesBulk", { ids: selected.value.map(item => item.id) })) closeSelection(); }
async function remove(expense: ExpenseRecord) { if (confirm(`${expense.name} шығыны өшірілсін бе?`)) await payroll.mutate("deleteExpense", { id: expense.id }); }
</script>

<template>
  <div class="page expenses-page">
    <section class="summary-strip">
      <div><span>Жоспарланған шығын</span><strong>{{ formatMoney(total) }}</strong></div>
      <div class="success"><span>Төленген</span><strong>{{ formatMoney(paid) }}</strong></div>
      <div class="brand"><span>Қалғаны</span><strong>{{ formatMoney(Math.max(0, total - paid)) }}</strong></div>
      <div><span>Шығын саны</span><strong>{{ rows.length }}</strong></div>
    </section>

    <section class="panel table-panel">
      <header class="table-toolbar"><div><span class="eyebrow">Тұрақты операциялар</span><h2>Шығындар тізімі</h2><p>Төленетін және ай сайын қайталанатын шығындар</p></div><div class="toolbar-actions"><label class="search-field"><Search :size="17" /><input v-model="search" placeholder="Атауы немесе категория" /></label><button class="button primary" type="button" @click="openForm()"><Plus :size="17" /> Шығын қосу</button></div></header>
      <div v-if="rows.length" class="selection-bar" :class="{ active: selectionMode }"><button v-if="!selectionMode" class="button subtle" type="button" @click="toggleAll"><CheckCircle2 :size="16" /> Таңдау режимі</button><template v-else><div><label><input type="checkbox" :checked="allSelected" @change="toggleAll" /> {{ allSelected ? "Барлығы таңдалды" : "Барлығын таңдау" }}</label><button type="button" @click="closeSelection"><X :size="15" /> Аяқтау</button></div><div v-if="selected.length"><strong>{{ selected.length }} таңдалды</strong><button type="button" @click="setPaid(true)"><CheckCircle2 :size="15" /> Төленді</button><button type="button" @click="setPaid(false)"><Clock3 :size="15" /> Төленбеді</button><button type="button" class="danger" @click="removeSelected"><Trash2 :size="15" /> Өшіру</button></div><span v-else>Қажетті шығындарды белгілеңіз</span></template></div>

      <div v-if="filtered.length" class="expense-table responsive-table" :class="{ selecting: selectionMode }">
        <div class="table-header"><span v-if="selectionMode" /><span>Шығын</span><span>Категория</span><span>Қайталану</span><span>Сома</span><span>Статус</span><span /></div>
        <div v-for="expense in filtered" :key="expense.id" class="table-record" :class="{ selected: selectedIds.has(expense.id) }">
          <label v-if="selectionMode" class="row-check"><input type="checkbox" :checked="selectedIds.has(expense.id)" @change="toggle(expense.id)" /></label>
          <div class="expense-name"><span><ReceiptText :size="18" /></span><strong>{{ expense.name }}</strong></div>
          <div data-label="Категория"><span class="tag">{{ expense.categoryName }}</span></div>
          <div data-label="Қайталану"><span :class="expense.isRecurring ? 'recurring-tag' : 'once-tag'">{{ expense.isRecurring ? "Ай сайын" : "Бір рет" }}</span></div>
          <div data-label="Сома" class="money total">{{ formatMoney(expense.amount) }}</div>
          <button type="button" data-label="Төлем статусы" class="status-toggle" :class="{ paid: expense.isPaid }" :disabled="payroll.isPending('toggleExpensePaid', expense.id)" @click="payroll.mutate('toggleExpensePaid', { id: expense.id, isPaid: !expense.isPaid })"><i><Check v-if="expense.isPaid" :size="13" /></i>{{ expense.isPaid ? "Төленді" : "Төленбеді" }}</button>
          <div class="row-actions"><button type="button" aria-label="Өзгерту" @click="openForm(expense)"><Pencil :size="16" /></button><button type="button" class="danger" aria-label="Өшіру" @click="remove(expense)"><Trash2 :size="16" /></button></div>
        </div>
      </div>
      <div v-else class="empty-state"><span><ReceiptText :size="25" /></span><strong>Шығындар тізімі бос</strong><p>Алғашқы операциялық шығынды қосыңыз.</p><button class="button primary" @click="openForm()"><Plus :size="17" /> Шығын қосу</button></div>
    </section>
  </div>
  <ExpenseForm v-if="formOpen" :expense="editExpense" @close="formOpen = false" @saved="formOpen = false" />
</template>
