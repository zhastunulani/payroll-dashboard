<script setup lang="ts">
import { ArrowDownToLine, Printer } from "lucide-vue-next";
import { counts, needsAssignment, summarizeBank, type BankOperation, type BankProject } from "../../lib/bank";
import type { BankStatementInfo } from "../../lib/bank-database";

/** The report follows the project chosen with the cards above ("all" = every project). */
const props = defineProps<{ operations: BankOperation[]; projects: BankProject[]; statements: BankStatementInfo[]; colorOf: (id: string) => string; project: string }>();
const bank = useBank();
const { t } = useLocale();
const scope = computed(() => props.projects.some(p => p.id === props.project) ? props.project : "all");
const scopeName = computed(() => props.projects.find(p => p.id === scope.value)?.name ?? t("Барлық жоба"));
const counted = computed(() => props.operations.filter(o => counts(o) && (scope.value === "all" || o.projectId === scope.value)));
const s = computed(() => summarizeBank(counted.value));
const waiting = computed(() => props.operations.filter(needsAssignment));
const waitingSum = computed(() => waiting.value.filter(o => o.kind === "sale" || o.kind === "settlement").reduce((a, o) => a + o.amount, 0));
const duplicates = computed(() => props.statements.reduce((a, st) => a + st.duplicatesSkipped, 0));
const coveredTo = computed(() => props.statements.map(st => st.periodTo).filter(Boolean).sort().at(-1) ?? null);
const monthEnd = computed(() => { const [y, m] = bank.period.value.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); });
const partial = computed(() => coveredTo.value !== null && coveredTo.value < monthEnd.value && coveredTo.value >= `${bank.period.value}-01`);

const byProject = computed(() => {
  const total = summarizeBank(props.operations.filter(counts)).turnover;
  return props.projects
    .map(p => ({ id: p.id, name: p.name, color: props.colorOf(p.id), s: summarizeBank(props.operations.filter(o => counts(o) && o.projectId === p.id)) }))
    .filter(r => r.s.operations)
    .map(r => ({ ...r, share: total > 0 ? r.s.turnover / total : null }));
});
const printReport = () => window.print();
const day = (iso: string | null) => iso ? iso.split("-").reverse().join(".") : "—";
const pct = (v: number | null, digits = 1) => v === null ? "—" : formatPercent(v, digits);

async function exportExcel() {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const h = (labels: string[]) => labels.map(label => ({ value: t(label), fontWeight: "bold" as const }));
  const n = (v: number | null, format = "#,##0.00") => v === null ? null : { value: v, format };
  const p = (v: number | null) => v === null ? null : { value: v, format: "0.00%" };
  const txt = (v: string) => ({ value: v });
  const summary = [h(["Жоба", "Оборот", "Операция", "Қайтарым", "Комиссия", "Салық", "Комиссиядан кейін", "Шотқа түскені", "Kaspi-ден күтілетін", "Оборот үлесі"]),
    ...byProject.value.map(r => [txt(r.name), n(r.s.turnover), n(r.s.salesCount + r.s.settlementCount, "0"), n(r.s.refunds), n(r.s.commission), n(r.s.tax), n(r.s.afterCommission), n(r.s.credited), n(r.s.pending), p(r.share)]),
    [txt(t("Бөлуді күтетін операциялар")), n(waitingSum.value), n(waiting.value.length, "0")]];
  const methods = [h(["Төлем тәсілі", "Сделка", "Оборот", "Оборот үлесі", "Комиссия үлесі", "Орташа чек", "Комиссия", "Ставка"]),
    ...s.value.byMethod.map(m => [txt(m.method), n(m.count, "0"), n(m.turnover), p(m.share), p(m.commissionShare), n(m.avg), n(m.commission), p(m.rate)])];
  const installment = [h(["Заңды тұлға", "Рассрочка көлемі", "Комиссия", "Ставка"]), ...s.value.installmentByEntity.map(e => [txt(e.entity), n(e.volume), n(e.commission), p(e.rate)])];
  const refunds = [h(["Заңды тұлға", "Қайтарым саны", "Қайтарым сомасы", "Оборот үлесі"]), ...s.value.byEntity.map(e => [txt(e.entity), n(e.count, "0"), n(e.refunds), p(e.refundShare)])];
  await writeXlsxFile([summary, methods, installment, refunds], {
    sheets: ["Жобалар бойынша", "Төлем тәсілдері", "Рассрочка ставкасы", "Қайтарымдар"].map(name => t(name)),
    fileName: `bank-report-${bank.period.value}.xlsx`,
  });
}
</script>

<template>
  <div class="bank-reports">
    <div class="bank-report-bar">
      <p class="bank-scope"><i v-if="scope !== 'all'" :style="{ background: colorOf(scope) }" />{{ scopeName }} <small>{{ t("· басқа жобаны жоғарыдағы карточкадан таңдаңыз") }}</small></p>
      <div class="ledger-actions"><button class="button secondary" type="button" @click="exportExcel"><ArrowDownToLine :size="16" /> {{ t("Excel есеп") }}</button><button class="button secondary" type="button" @click="printReport"><Printer :size="16" /> {{ t("PDF / басып шығару") }}</button></div>
    </div>
    <p v-if="!statements.length" class="bank-warning">{{ t("Бұл айға банк деректері жоқ: выписка жүктелмеген.") }}</p>
    <p v-else-if="partial" class="bank-warning">{{ t("Выписка {d} дейін ғана: ай толық емес.").replace("{d}", day(coveredTo)) }}</p>

    <section class="panel analytics-panel bank-waterfall">
      <header><div><span class="eyebrow">{{ periodLabel(bank.period.value) }}</span><h2>{{ t("Нақты түсімдер және сверка") }}</h2></div><small class="panel-note">{{ t("Соңғы жүктеу") }}: {{ statements[0]?.uploadedAt.slice(0, 16).replace("T", " ") ?? "—" }}</small></header>
      <table class="pnl-table detail">
        <tbody>
          <tr class="subtotal"><th scope="row">Валовой оборот</th><td>{{ money(s.turnover) }}</td><td><span class="source ok">{{ t("Выпискамен расталды") }}</span></td></tr>
          <tr class="sub"><th scope="row">{{ t("оның ішінде жеке сатылымдар (Kaspi)") }}</th><td>{{ money(s.grossSales) }} · {{ s.salesCount }} {{ t("төлем") }}</td><td /></tr>
          <tr v-if="s.cash" class="sub"><th scope="row">{{ t("оның ішінде қолма-қол (Kaspi Pay-де тіркелген)") }}</th><td>{{ money(s.cash) }}</td><td><span class="source">{{ t("Шотқа түспейді") }}</span></td></tr>
          <tr v-if="s.settlementCount" class="sub"><th scope="row">{{ t("карта бойынша есеп айырысулар (Halyk)") }}</th><td>{{ money(s.settlements) }} · {{ s.settlementCount }} {{ t("күн") }}</td><td><span class="source">{{ t("Эквайринг комиссиясы шегерілген") }}</span></td></tr>
          <tr><th scope="row">{{ t("Орташа чек / медиана") }}</th><td>{{ money(s.avgCheck) }} / {{ money(s.medianCheck) }}</td><td><span class="source">{{ t("Есептелді") }}</span></td></tr>
          <tr><th scope="row">− {{ t("Қайтарымдар") }}</th><td>{{ money(s.refunds) }} · {{ s.refundCount }}</td><td><span class="source ok">Выписка</span></td></tr>
          <tr><th scope="row">− {{ t("Банк комиссиялары") }}</th><td>{{ money(s.commission) }}</td><td><span class="source ok">Выписка</span><small v-if="s.vatInFees"> {{ t("ҚҚС") }} {{ money(s.vatInFees) }}</small></td></tr>
          <tr><th scope="row">− {{ t("Салықтар") }}</th><td>{{ s.tax === null ? "—" : money(s.tax) }}</td><td><span class="source" :class="{ ok: s.tax !== null }">{{ s.tax === null ? t("Выпискада көрсетілмеген — есептелмейді") : "Выписка" }}</span></td></tr>
          <tr class="result"><th scope="row">= {{ t("Комиссиядан кейін") }}</th><td>{{ money(s.afterCommission) }}</td><td /></tr>
          <tr class="result"><th scope="row">= {{ t("Комиссия мен салықтан кейін") }}</th><td>{{ money(s.afterTax) }}</td><td /></tr>
          <tr><th scope="row">{{ t("Нақты шотқа түскені") }}</th><td>{{ s.credited === null ? "—" : money(s.credited) }}</td><td><span class="source" :class="{ ok: s.credited !== null }">{{ s.credited === null ? t("Шот выпискасы жоқ") : t("Halyk шот выпискасы") }}</span></td></tr>
          <tr><th scope="row">{{ t("Түсуін күтетін (Kaspi)") }}</th><td>{{ money(s.pending) }}</td><td><span class="source">{{ t("Есептелді: сатылым − қайтарым − комиссия") }}</span></td></tr>
          <tr class="sub owed"><th scope="row">{{ t("Бөлуді күтетін операциялар (ешбір жобаға кірмеген)") }}</th><td class="owed">{{ waiting.length }} · {{ money(waitingSum) }}</td><td><span class="source warn">{{ t("Тексеру керек") }}</span></td></tr>
          <tr class="sub"><th scope="row">{{ t("Қайта жүктеуде өткізілген дубликаттар") }}</th><td>{{ duplicates }}</td><td /></tr>
        </tbody>
      </table>
      <p class="panel-footnote">{{ t("Валовой оборот пайда емес. Салық выпискада бөлек көрсетілгенде ғана есепке алынады; жүйе оны өзі есептемейді. Kaspi түсімі Kaspi шотына түседі — оны растау үшін шот выпискасы керек.") }}</p>
    </section>

    <div class="insight-grid bank-tables">
      <section class="panel analytics-panel wide">
        <header><div><span class="eyebrow">{{ t("Төлем тәсілдері") }}</span><h2>{{ t("Способ оплаты бойынша") }}</h2></div></header>
        <div class="table-scroll">
          <table class="pnl-table detail">
            <thead><tr><th scope="col">{{ t("Тәсіл") }}</th><th scope="col">Сделка</th><th scope="col">Оборот</th><th scope="col">{{ t("Оборот үлесі") }}</th><th scope="col">{{ t("Комиссия үлесі") }}</th><th scope="col">{{ t("Орташа чек") }}</th><th scope="col">Комиссия</th><th scope="col">Ставка</th></tr></thead>
            <tbody>
              <tr v-for="m in s.byMethod" :key="m.method"><th scope="row">{{ m.method }}</th><td>{{ m.count }}</td><td>{{ money(m.turnover) }}</td><td>{{ pct(m.share) }}</td><td>{{ pct(m.commissionShare) }}</td><td>{{ money(m.avg) }}</td><td>{{ money(m.commission) }}</td><td>{{ m.rate === null ? t("белгісіз") : pct(m.rate, 2) }}</td></tr>
              <tr v-if="!s.byMethod.length"><td colspan="8" class="panel-empty">{{ t("Бөлінген сатылым жоқ.") }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">Рассрочка</span><h2>{{ t("Ставка заңды тұлғалар бойынша") }}</h2></div></header>
        <table class="pnl-table detail">
          <thead><tr><th scope="col">{{ t("Заңды тұлға") }}</th><th scope="col">{{ t("Көлемі") }}</th><th scope="col">Комиссия</th><th scope="col">Ставка</th></tr></thead>
          <tbody>
            <tr v-for="e in s.installmentByEntity" :key="e.entity"><th scope="row">{{ e.entity }}</th><td>{{ money(e.volume) }}</td><td>{{ money(e.commission) }}</td><td>{{ pct(e.rate, 2) }}</td></tr>
            <tr v-if="!s.installmentByEntity.length"><td colspan="4" class="panel-empty">{{ t("Рассрочкамен сатылым жоқ.") }}</td></tr>
          </tbody>
        </table>
        <p class="panel-footnote">{{ t("Кредит на покупки, Kaspi Red. Ставка = комиссия ÷ көлем. Комиссия заңды тұлғаларға бөлінбей жалпы сомамен келсе, «Бөлу керек» деп белгіленеді.") }}</p>
      </section>
      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">{{ t("Қайтарымдар") }}</span><h2>{{ t("Заңды тұлғалар бойынша") }}</h2></div></header>
        <table class="pnl-table detail">
          <thead><tr><th scope="col">{{ t("Заңды тұлға") }}</th><th scope="col">{{ t("Саны") }}</th><th scope="col">{{ t("Сомасы") }}</th><th scope="col">{{ t("Оборот үлесі") }}</th></tr></thead>
          <tbody>
            <tr v-for="e in s.byEntity" :key="e.entity"><th scope="row">{{ e.entity }}</th><td>{{ e.count }}</td><td>{{ money(e.refunds) }}</td><td>{{ pct(e.refundShare, 2) }}</td></tr>
          </tbody>
        </table>
        <p class="panel-footnote">{{ t("Қайтарым сатылымды өшірмейді: екеуі бөлек операция болып сақталады.") }}</p>
      </section>
    </div>

    <section v-if="scope === 'all'" class="panel analytics-panel">
      <header><div><span class="eyebrow">{{ t("Салыстыру") }}</span><h2>{{ t("Жобалар бойынша нақты түсім") }}</h2></div></header>
      <div class="table-scroll">
        <table class="pnl-table">
          <thead><tr><th scope="col">{{ t("Жоба") }}</th><th scope="col">Оборот</th><th scope="col">{{ t("Үлесі") }}</th><th scope="col">{{ t("Қайтарым") }}</th><th scope="col">Комиссия</th><th scope="col">{{ t("Комиссиядан кейін") }}</th><th scope="col">{{ t("Шотқа түскені") }}</th></tr></thead>
          <tbody>
            <tr v-for="r in byProject" :key="r.id"><th scope="row"><i class="group-dot" :style="{ background: r.color }" />{{ r.name }}</th><td>{{ money(r.s.turnover) }}</td><td>{{ pct(r.share) }}</td><td>{{ money(r.s.refunds) }}</td><td>{{ money(r.s.commission) }}</td><td>{{ money(r.s.afterCommission) }}</td><td>{{ r.s.credited === null ? "—" : money(r.s.credited) }}</td></tr>
            <tr class="sub owed"><th scope="row">{{ t("Бөлуді күтетін") }}</th><td class="owed">{{ money(waitingSum) }}</td><td /><td /><td /><td /><td /></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
