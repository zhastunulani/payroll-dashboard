<script setup lang="ts">
import { ArrowRight, CheckCircle2, Clock3, Lightbulb, Plus, ShoppingBag, Sparkles, Target, UsersRound, WalletCards } from "lucide-vue-next";

const payroll = usePayroll();
const { formatMoney, percentChange } = useFormatters();
const expenseModal = ref(false);
const expenseName = ref("");
const expenseAmount = ref<number | null>(null);
const data = computed(() => payroll.data.value);
const oneTime = computed(() => data.value?.expenses.filter(item => item.isOneTime) || []);
const oneTimeTotal = computed(() => oneTime.value.reduce((sum, item) => sum + item.amount, 0));
const operational = computed(() => data.value?.expenses.filter(item => !item.isOneTime) || []);
const paidSalaries = computed(() => data.value?.salaries.filter(item => item.isPaid).reduce((sum, item) => sum + item.total, 0) || 0);
const paidOperations = computed(() => operational.value.filter(item => item.isPaid).reduce((sum, item) => sum + item.amount, 0));
const previous = computed(() => data.value?.previousStats);
const changes = computed(() => [...(data.value?.departmentBreakdown || []), ...(data.value?.expenseBreakdown || [])].filter(item => item.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5));
const largestDepartment = computed(() => data.value?.departmentBreakdown[0]);

function openExpense() {
  expenseName.value = "";
  expenseAmount.value = null;
  expenseModal.value = true;
}
async function saveExpense() {
  if (!expenseName.value.trim() || !expenseAmount.value || expenseAmount.value <= 0) return;
  if (await payroll.mutate("saveOneTimeExpense", { name: expenseName.value, amount: expenseAmount.value })) expenseModal.value = false;
}
</script>

<template>
  <div v-if="data" class="page dashboard-page">
    <section class="finance-command">
      <div class="command-copy">
        <span class="eyebrow light">{{ data.selectedMonth.label }} · ақша қозғалысы</span>
        <h2>Осы айда <strong>{{ formatMoney(data.stats.remainingTotal) }}</strong> төлеу қалды</h2>
        <p>{{ data.stats.paymentProgress }}% орындалды · {{ data.stats.paidEmployees }} қызметкердің айлығы төленді</p>
      </div>
      <div class="command-progress" :style="{ '--progress': `${data.stats.paymentProgress}%` }"><span><strong>{{ data.stats.paymentProgress }}%</strong><small>орындалды</small></span></div>
      <button class="button light" type="button" @click="openExpense"><Plus :size="18" /> Шығын тіркеу</button>
    </section>

    <section class="metric-grid">
      <MetricCard label="Жалпы жоспар" :value="data.stats.plannedTotal" hint="Айлықтар мен барлық шығын" :change="percentChange(data.stats.plannedTotal, previous?.plannedTotal)" tone="brand"><template #icon><Target :size="20" /></template></MetricCard>
      <MetricCard label="Жұмсалған ақша" :value="data.stats.paidTotal" :hint="`${data.stats.paidEmployees}/${data.stats.employeeCount} қызметкер`" :change="percentChange(data.stats.paidTotal, previous?.paidTotal)" tone="success"><template #icon><CheckCircle2 :size="20" /></template></MetricCard>
      <MetricCard label="Төленуі керек" :value="data.stats.remainingTotal" :hint="`${100 - data.stats.paymentProgress}% әлі орындалмады`" :change="percentChange(data.stats.remainingTotal, previous?.remainingTotal)" tone="warning"><template #icon><Clock3 :size="20" /></template></MetricCard>
      <MetricCard label="Айлық қоры" :value="data.stats.salaryTotal" :hint="`${data.stats.employeeCount} қызметкер`" :change="percentChange(data.stats.salaryTotal, previous?.salaryTotal)"><template #icon><UsersRound :size="20" /></template></MetricCard>
    </section>

    <section class="dashboard-layout">
      <article class="panel cashflow-panel">
        <header class="panel-header"><div><span class="eyebrow">Ақша құрылымы</span><h2>Қайда жұмсалып жатыр?</h2></div><NuxtLink to="/departments" class="text-link">Толық көру <ArrowRight :size="16" /></NuxtLink></header>
        <BreakdownList :items="data.departmentBreakdown" :limit="6" empty="Қызметкерлер қосылғанда құрылым шығады" />
      </article>

      <article class="panel spend-panel">
        <header class="panel-header"><div><span class="eyebrow">Нақты шығыс</span><h2>Осы айда жұмсалды</h2></div><span class="period-badge">{{ data.selectedMonth.label }}</span></header>
        <div class="spend-total"><strong>{{ formatMoney(data.stats.paidTotal) }}</strong><span>жалпы нақты шығыс</span></div>
        <div class="spend-split">
          <div><span><WalletCards :size="17" /> Төленген айлық</span><strong>{{ formatMoney(paidSalaries) }}</strong></div>
          <div><span><CheckCircle2 :size="17" /> Тұрақты шығын</span><strong>{{ formatMoney(paidOperations) }}</strong></div>
          <div><span><ShoppingBag :size="17" /> Бір реттік шығын</span><strong>{{ formatMoney(oneTimeTotal) }}</strong></div>
        </div>
        <NuxtLink to="/other-expenses" class="quick-register"><span><ShoppingBag :size="20" /></span><div><strong>Жаңа шығынды бірден тіркеңіз</strong><small>{{ oneTime.length }} жазба · {{ formatMoney(oneTimeTotal) }}</small></div><ArrowRight :size="18" /></NuxtLink>
      </article>

      <article class="panel expense-structure">
        <header class="panel-header"><div><span class="eyebrow">Шығындар</span><h2>Категориялар бойынша</h2></div><NuxtLink to="/expenses" class="text-link">Басқару <ArrowRight :size="16" /></NuxtLink></header>
        <BreakdownList :items="data.expenseBreakdown" :limit="5" empty="Шығындар қосылғанда статистика шығады" />
      </article>

      <article class="panel insight-panel">
        <header class="panel-header"><div><span class="eyebrow">Айлық динамика</span><h2>Назар аударатын өзгерістер</h2></div><Sparkles :size="20" /></header>
        <div v-if="data.previousMonth && changes.length" class="insight-list">
          <div v-for="item in changes" :key="`${item.id}-${item.name}`"><span :class="item.change > 0 ? 'dot danger' : 'dot success'" /><div><strong>{{ item.name }}</strong><small>{{ item.change > 0 ? "Шығын өсті" : "Шығын азайды" }}</small></div><b :class="item.change > 0 ? 'negative-change' : 'positive-change'">{{ item.change > 0 ? "+" : "−" }}{{ formatMoney(Math.abs(item.change)) }}</b></div>
        </div>
        <div v-else class="empty-insight"><Lightbulb :size="24" /><strong>{{ data.previousMonth ? "Айтарлықтай өзгеріс жоқ" : "Салыстыру үшін алдыңғы ай қажет" }}</strong><span>Жаңа ай құрылғанда динамика автоматты есептеледі.</span></div>
        <div v-if="largestDepartment" class="decision-tip"><Lightbulb :size="18" /><span>Ең үлкен айлық қоры — <strong>{{ largestDepartment.name }}</strong>: {{ formatMoney(largestDepartment.amount) }}</span></div>
      </article>
    </section>
  </div>

  <UiModal v-if="expenseModal" title="Жаңа шығын" description="Сома бірден осы айдың жұмсалған ақшасына қосылады" @close="expenseModal = false">
    <form class="form-stack" @submit.prevent="saveExpense">
      <label class="form-field"><span>Шығын атауы</span><input v-model="expenseName" placeholder="Мысалы: кеңсе орындықтары" required /></label>
      <label class="form-field"><span>Сома</span><div class="money-input"><input v-model.number="expenseAmount" type="number" min="1" step="1" placeholder="0" required /><b>₸</b></div></label>
      <div class="modal-actions"><button type="button" class="button ghost" @click="expenseModal = false">Болдырмау</button><button class="button primary" :disabled="payroll.saving.value">{{ payroll.saving.value ? "Сақталуда…" : "Реестрге қосу" }}</button></div>
    </form>
  </UiModal>
</template>
