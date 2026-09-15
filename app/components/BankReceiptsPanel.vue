<script setup lang="ts">
import { ArrowRight, TriangleAlert } from "lucide-vue-next";
import { cashResult, type BankSummary } from "../../lib/bank";

const props = defineProps<{
  bank: BankSummary | null;
  categories: { key: string; amount: number | null }[];
  projectId: string;
  period: string;
  pending: { count: number; amount: number } | null;
  coveredTo: string | null;
  statementsExist: boolean;
}>();
const cash = computed(() => props.bank ? cashResult(props.bank, props.categories) : null);
const reportLink = computed(() => `/bank?${new URLSearchParams({ tab: "reports", project: props.projectId, month: props.period })}`);
const waitingLink = computed(() => `/bank?${new URLSearchParams({ status: "waiting", month: props.period })}`);
const monthEnd = computed(() => { const [y, m] = props.period.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); });
const partial = computed(() => !!props.coveredTo && props.coveredTo >= `${props.period}-01` && props.coveredTo < monthEnd.value);
const day = (iso: string | null) => iso ? iso.split("-").reverse().join(".") : "—";
</script>

<template>
  <section class="panel analytics-panel bank-receipts">
    <header>
      <div><span class="eyebrow">Банк выпискасы бойынша</span><h2>Нақты түсімдер және сверка</h2></div>
      <NuxtLink :to="reportLink" class="text-button">Банк есебі <ArrowRight :size="14" /></NuxtLink>
    </header>
    <p v-if="!statementsExist" class="bank-warning"><TriangleAlert :size="15" /> Банк выпискасы әлі жүктелмеген. <NuxtLink to="/bank" class="text-button">Выписка жүктеу</NuxtLink></p>
    <template v-else>
      <p v-if="partial" class="bank-warning"><TriangleAlert :size="15" /> Выписка {{ day(coveredTo) }} дейін ғана — ай толық емес.</p>
      <p v-if="pending?.count" class="bank-warning"><TriangleAlert :size="15" /> {{ pending.count }} операция ({{ money(pending.amount) }}) әлі ешбір жобаға бөлінбеген және бұл есепке кірмеген. <NuxtLink :to="waitingLink" class="text-button">Бөлу</NuxtLink></p>
      <p v-if="!bank" class="panel-empty">Бұл айда бұл жобаға бөлінген банк операциясы жоқ.</p>
      <div v-else class="table-scroll">
        <table class="pnl-table detail">
          <tbody>
            <tr class="subtotal"><th scope="row">Валовой оборот</th><td>{{ money(cash!.gross) }}</td><td><span class="source ok">Выписка</span></td></tr>
            <tr><th scope="row">− Қайтарымдар</th><td>{{ money(cash!.refunds) }}</td><td><span class="source ok">Выписка</span></td></tr>
            <tr><th scope="row">− Банк комиссиялары</th><td>{{ money(cash!.commission) }}</td><td><span class="source ok">Выписка</span></td></tr>
            <tr><th scope="row">− Салықтар</th><td>{{ cash!.tax === null ? "—" : money(cash!.tax) }}</td><td><span class="source" :class="{ ok: cash!.tax !== null }">{{ cash!.tax === null ? "Выпискада көрсетілмеген" : "Выписка" }}</span></td></tr>
            <tr class="result"><th scope="row">= Таза түсім</th><td>{{ money(cash!.net) }}</td><td><span class="source">Есептелді</span></td></tr>
            <tr><th scope="row">− Жарнама (таргет + сыртқы)</th><td>{{ money(cash!.advertising) }}</td><td><span class="source">Қаржы модулі</span></td></tr>
            <tr><th scope="row">− ФОТ</th><td>{{ money(cash!.payroll) }}</td><td><span class="source">Payroll</span></td></tr>
            <tr><th scope="row">− Аренда</th><td>{{ money(cash!.rent) }}</td><td><span class="source">Қаржы модулі</span></td></tr>
            <tr><th scope="row">− Оқыту өзіндік құны</th><td>{{ money(cash!.teaching) }}</td><td><span class="source">Мердігерлер, айнымалы</span></td></tr>
            <tr><th scope="row">− Операциялық шығындар</th><td>{{ money(cash!.opex) }}</td><td><span class="source">Қаржы модулі</span></td></tr>
            <tr class="result"><th scope="row">= Операциялық пайда (ақшалай)</th><td :class="{ negative: cash!.operatingProfit < 0 }">{{ money(cash!.operatingProfit) }}</td><td>{{ cash!.margin === null ? "" : `маржа ${formatPercent(cash!.margin)}` }}</td></tr>
            <tr v-if="cash!.capital" class="sub"><th scope="row">Бөлек: жабдық және депозит</th><td>{{ money(cash!.capital) }}</td><td><span class="source">Нәтижеге кірмейді</span></td></tr>
            <tr class="sub"><th scope="row">Нақты шотқа түскені / Kaspi-ден күтілетін</th><td>{{ bank.credited === null ? "—" : money(bank.credited) }} / {{ money(bank.pending) }}</td><td /></tr>
            <tr class="sub"><th scope="row">Сатылым саны · орташа / медиана чек</th><td>{{ bank.salesCount }} · {{ money(bank.avgCheck) }} / {{ money(bank.medianCheck) }}</td><td /></tr>
          </tbody>
        </table>
      </div>
      <p class="panel-footnote">Валовой оборот пайда емес. Бұл — ақша ағыны бойынша нәтиже (кассалық әдіс). Жоғарыдағы P&L қолмен енгізілген табыс бойынша есептеледі.</p>
    </template>
  </section>
</template>
