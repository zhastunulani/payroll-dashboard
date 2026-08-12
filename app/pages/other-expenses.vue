<script setup lang="ts">
import { Pencil, Plus, Search, ShoppingBag, Trash2 } from "lucide-vue-next";
import type { ExpenseRecord } from "../../lib/types";

const payroll = usePayroll();
const { formatMoney } = useFormatters();
const search = ref("");
const editExpense = ref<ExpenseRecord | null>(null);
const formOpen = ref(false);
const rows = computed(() => payroll.data.value?.expenses.filter(item => item.isOneTime) || []);
const filtered = computed(() => { const query = search.value.trim().toLocaleLowerCase("kk-KZ"); return query ? rows.value.filter(item => item.name.toLocaleLowerCase("kk-KZ").includes(query)) : rows.value; });
const total = computed(() => rows.value.reduce((sum, item) => sum + item.amount, 0));
function openForm(expense: ExpenseRecord | null = null) { editExpense.value = expense; formOpen.value = true; }
async function remove(expense: ExpenseRecord) { if (confirm(`${expense.name} шығыны реестрден өшірілсін бе?`)) await payroll.mutate("deleteExpense", { id: expense.id }); }
</script>

<template>
  <div class="page registry-page">
    <section class="registry-hero">
      <div><span class="registry-icon"><ShoppingBag :size="25" /></span><span class="eyebrow light">Бір реттік шығындар</span><h2>Осы айда {{ formatMoney(total) }} жұмсалды</h2><p>Бұл жазбалар төленген болып автоматты есептеледі және келесі айға көшірілмейді.</p></div>
      <button class="button light" type="button" @click="openForm()"><Plus :size="18" /> Жаңа шығын</button>
    </section>
    <section class="panel registry-panel">
      <header class="table-toolbar"><div><span class="eyebrow">Реестр</span><h2>Жұмсалған ақша тізімі</h2><p>{{ payroll.data.value?.selectedMonth.label }}</p></div><label class="search-field"><Search :size="17" /><input v-model="search" placeholder="Шығын атауын іздеу" /></label></header>
      <div v-if="filtered.length" class="registry-list">
        <article v-for="(expense, index) in filtered" :key="expense.id"><span class="registry-number">{{ String(index + 1).padStart(2, "0") }}</span><div><strong>{{ expense.name }}</strong><small>Басқа шығындар · жұмсалды</small></div><b>{{ formatMoney(expense.amount) }}</b><span class="row-actions"><button type="button" aria-label="Өзгерту" @click="openForm(expense)"><Pencil :size="16" /></button><button type="button" class="danger" aria-label="Өшіру" @click="remove(expense)"><Trash2 :size="16" /></button></span></article>
      </div>
      <div v-else class="empty-state"><span><ShoppingBag :size="25" /></span><strong>Бұл айда бір реттік шығын жоқ</strong><p>Парта, орындық немесе басқа сатып алуды реестрге тіркеңіз.</p><button class="button primary" @click="openForm()"><Plus :size="17" /> Жаңа шығын</button></div>
    </section>
  </div>
  <ExpenseForm v-if="formOpen" :expense="editExpense" one-time @close="formOpen = false" @saved="formOpen = false" />
</template>
