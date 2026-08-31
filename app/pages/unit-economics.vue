<script setup lang="ts">
import {
  Calculator,
  CircleDollarSign,
  PiggyBank,
  Save,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-vue-next";
import { computeUnitEconomics } from "../../lib/unit-economics";
import type {
  UnitCostGroup,
  UnitEconomicsSettings,
  UnitType,
} from "../../lib/types";

const payroll = usePayroll();
const { formatMoney } = useFormatters();
const saved = ref(false);
const draft = reactive<UnitEconomicsSettings>({
  unitType: "order",
  revenue: 0,
  unitCount: 0,
  leads: 0,
  acquiredCustomers: 0,
  marketingPeriod: "",
  marketingSpend: 0,
  marketingSpendUsd: 0,
  payrollTaxes: 0,
  contractorPayments: 0,
  categoryGroups: {},
});

const unitTypes: Array<{ value: UnitType; label: string; one: string }> = [
  { value: "order", label: "Тапсырыс", one: "тапсырыс" },
  { value: "client", label: "Клиент", one: "клиент" },
  { value: "product", label: "Тауар", one: "тауар" },
  { value: "service", label: "Қызмет", one: "қызмет" },
];
const costGroups: Array<{ value: UnitCostGroup; label: string }> = [
  { value: "payroll", label: "ФОТ / команда" },
  { value: "variable", label: "Айнымалы шығын" },
  { value: "marketing", label: "Маркетинг" },
  { value: "fixed", label: "Тұрақты шығын" },
  { value: "excluded", label: "Есепке қоспау" },
];

const dataKey = computed(() => {
  const data = payroll.data.value;
  return data ? `${data.selectedWorkspace.id}:${data.selectedMonth.id}` : "";
});

watch(dataKey, () => {
  const settings = payroll.data.value?.unitEconomics.settings;
  if (!settings) return;
  Object.assign(draft, JSON.parse(JSON.stringify(settings)));
  saved.value = false;
}, { immediate: true });

const result = computed(() => {
  const data = payroll.data.value;
  if (!data) return null;
  return computeUnitEconomics(data.stats.salaryTotal, data.expenses, draft);
});
const unitLabel = computed(() => unitTypes.find((item) => item.value === draft.unitType)?.one ?? "бірлік");
const ready = computed(() => draft.revenue > 0 && draft.unitCount > 0);

function metric(value: number | null): string {
  return value === null ? "—" : formatMoney(value);
}

async function save() {
  saved.value = false;
  if (await payroll.mutate("saveUnitEconomics", {
    settings: JSON.parse(JSON.stringify(draft)),
  })) {
    saved.value = true;
    window.setTimeout(() => { saved.value = false; }, 2500);
  }
}
</script>

<template>
  <div v-if="payroll.data.value && result" class="page unit-page">
    <section class="unit-hero">
      <div>
        <span class="eyebrow light">{{ payroll.data.value.selectedMonth.label }} · {{ payroll.data.value.selectedWorkspace.name }}</span>
        <h2>Бір {{ unitLabel }} қанша пайда әкеледі?</h2>
        <p>Табыс − айнымалы шығын − клиент тарту құны = тұрақты шығын мен пайданы жабатын үлес.</p>
      </div>
      <div class="unit-hero-result" :class="{ negative: result.summary.operatingProfit < 0 }">
        <small>Айдың таза нәтижесі</small>
        <strong>{{ formatMoney(result.summary.operatingProfit) }}</strong>
        <span v-if="result.summary.operatingMarginPercent !== null">Маржа {{ result.summary.operatingMarginPercent }}%</span>
        <span v-else>Табысты енгізіңіз</span>
      </div>
    </section>

    <section class="panel unit-input-panel">
      <header class="panel-header">
        <div><span class="eyebrow">Есеп негізі</span><h2>Табыс пен сату көлемі</h2><p>Сайтта жоқ үш көрсеткішті толтырыңыз</p></div>
        <button class="button primary" type="button" :disabled="payroll.saving.value" @click="save"><Save :size="17" /> {{ payroll.saving.value ? "Сақталуда…" : saved ? "Сақталды" : "Сақтау" }}</button>
      </header>
      <div class="unit-input-grid">
        <label class="form-field"><span>Есеп бірлігі</span><select v-model="draft.unitType"><option v-for="item in unitTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
        <label class="form-field"><span>Айлық табыс</span><div class="money-input"><input v-model.number="draft.revenue" type="number" min="0" step="1" /><b>₸</b></div></label>
        <label class="form-field"><span>{{ unitTypes.find(item => item.value === draft.unitType)?.label }} саны</span><input v-model.number="draft.unitCount" type="number" min="0" step="1" /></label>
        <label class="form-field"><span>Жаңа клиенттер саны</span><input v-model.number="draft.acquiredCustomers" type="number" min="0" step="1" /></label>
        <label class="form-field"><span>Салықтар мен аударымдар</span><div class="money-input"><input v-model.number="draft.payrollTaxes" type="number" min="0" step="1" /><b>₸</b></div></label>
        <label class="form-field"><span>Подрядчиктер төлемі</span><div class="money-input"><input v-model.number="draft.contractorPayments" type="number" min="0" step="1" /><b>₸</b></div></label>
      </div>
      <div class="unit-marketing-heading"><div><span class="eyebrow">Маркетинг воронкасы</span><h3>Таргет және лидтер</h3></div><span v-if="draft.marketingSpendUsd">Дерек: ${{ draft.marketingSpendUsd.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span></div>
      <div class="unit-input-grid marketing">
        <label class="form-field"><span>Жарнама кезеңі</span><input v-model="draft.marketingPeriod" type="text" maxlength="40" placeholder="29.07–29.08" /></label>
        <label class="form-field"><span>Лид саны</span><input v-model.number="draft.leads" type="number" min="0" step="1" /></label>
        <label class="form-field"><span>Жарнама шығыны</span><div class="money-input"><input v-model.number="draft.marketingSpend" type="number" min="0" step="1" /><b>₸</b></div></label>
        <label class="form-field"><span>Жарнама шығыны ($)</span><div class="money-input"><input v-model.number="draft.marketingSpendUsd" type="number" min="0" step="0.01" /><b>$</b></div></label>
      </div>
    </section>

    <section class="unit-metric-grid">
      <article><span><CircleDollarSign :size="19" /></span><small>Бір {{ unitLabel }} табыс</small><strong>{{ metric(result.summary.revenuePerUnit) }}</strong></article>
      <article><span><Target :size="19" /></span><small>CAC · жаңа клиент құны</small><strong>{{ metric(result.summary.customerAcquisitionCost) }}</strong></article>
      <article><span><TrendingDown :size="19" /></span><small>CPL · бір лид құны</small><strong>{{ metric(result.summary.costPerLead) }}</strong></article>
      <article><span><TrendingUp :size="19" /></span><small>Бір {{ unitLabel }} үлесі</small><strong>{{ metric(result.summary.contributionPerUnit) }}</strong></article>
      <article><span><Calculator :size="19" /></span><small>Залалсыздық нүктесі</small><strong>{{ result.summary.breakEvenUnits === null ? "—" : `${result.summary.breakEvenUnits} ${unitLabel}` }}</strong></article>
    </section>

    <section class="unit-layout">
      <article class="panel unit-cost-panel">
        <header class="panel-header"><div><span class="eyebrow">Барлық шығын</span><h2>Шығын құрылымы</h2><p>Айлықтар сайттан автоматты алынды</p></div><strong>{{ formatMoney(result.summary.totalCosts) }}</strong></header>
        <div class="unit-cost-list">
          <div><span class="unit-cost-icon payroll"><UsersRound :size="18" /></span><span><strong>ФОТ</strong><small>Айлық + салық + подрядчик</small></span><b>{{ formatMoney(result.summary.payroll) }}</b></div>
          <div><span class="unit-cost-icon variable"><WalletCards :size="18" /></span><span><strong>Айнымалы шығын</strong><small>Өнімге немесе тапсырысқа тікелей байланысты</small></span><b>{{ formatMoney(result.summary.variable) }}</b></div>
          <div><span class="unit-cost-icon marketing"><Target :size="18" /></span><span><strong>Маркетинг</strong><small>Таргет, жарнама және клиент тарту</small></span><b>{{ formatMoney(result.summary.marketing) }}</b></div>
          <div><span class="unit-cost-icon fixed"><PiggyBank :size="18" /></span><span><strong>Тұрақты шығын</strong><small>Аренда, сервис, байланыс және басқасы</small></span><b>{{ formatMoney(result.summary.fixed) }}</b></div>
        </div>
        <footer class="unit-formula">
          <div><span>Маржиналдық үлес</span><strong>{{ formatMoney(result.summary.contribution) }}</strong></div>
          <div :class="result.summary.operatingProfit >= 0 ? 'positive' : 'negative'"><span>{{ result.summary.operatingProfit >= 0 ? "Пайда" : "Залал" }}</span><strong>{{ formatMoney(Math.abs(result.summary.operatingProfit)) }}</strong></div>
        </footer>
      </article>

      <article class="panel unit-category-panel">
        <header class="panel-header"><div><span class="eyebrow">Классификация</span><h2>Категорияларды бөліңіз</h2><p>Таргет шығынын «Маркетинг» деп таңдаңыз</p></div></header>
        <div v-if="result.categories.length" class="unit-category-list">
          <label v-for="category in result.categories" :key="category.id">
            <span><strong>{{ category.name }}</strong><small>{{ formatMoney(category.amount) }}</small></span>
            <select v-model="draft.categoryGroups[category.id]">
              <option :value="undefined">Автоматты</option>
              <option v-for="group in costGroups" :key="group.value" :value="group.value">{{ group.label }}</option>
            </select>
          </label>
        </div>
        <div v-else class="unit-empty"><TrendingDown :size="22" /><span>Бұл айда операциялық шығындар жоқ.</span></div>
      </article>
    </section>

    <section v-if="!ready" class="unit-notice">
      <Calculator :size="20" /><span><strong>Есепті аяқтау үшін</strong> айлық табыс пен {{ unitLabel }} санын енгізіңіз. ФОТ және қолдағы шығындар дайын.</span>
    </section>
  </div>
</template>
