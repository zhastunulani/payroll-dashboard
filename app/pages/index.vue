<script setup lang="ts">
import { ArrowUpRight } from "lucide-vue-next";
import { FINANCE_CATEGORIES, PNL_ORDER, type FinanceCategory, type FinanceIssue, type FinanceSummary } from "../../lib/finance";

const finance = useFinance();
const ctx = useAppContext();
const { t } = useLocale();
const { projects, summaries, total, period } = finance;
onMounted(finance.load);

const previousOf = finance.previousOf;
/** Previous-month totals across projects, from the trend window (same definitions as this month). */
const previousTotal = (pick: (p: NonNullable<ReturnType<typeof previousOf>>) => number) => {
  const points = projects.value.map(p => previousOf(p.id)).filter(p => p?.hasData);
  return points.length ? points.reduce((a, p) => a + pick(p!), 0) : null;
};
const sum = (pick: (s: FinanceSummary) => number) => projects.value.reduce((a, p) => a + pick(summaries.value[p.id]!), 0);
const totals = computed(() => ({
  salary: sum(s => s.kinds.salary.total), salaryPaid: sum(s => s.kinds.salary.paid), salaryUnpaid: sum(s => s.kinds.salary.unpaid), salaryPeople: sum(s => s.kinds.salary.unpaidCount),
  mandatory: sum(s => s.kinds.mandatory.total), mandatoryPaid: sum(s => s.kinds.mandatory.paid), mandatoryUnpaid: sum(s => s.kinds.mandatory.unpaid), mandatoryItems: sum(s => s.kinds.mandatory.unpaidCount),
  target: sum(s => s.kinds.target.total), other: sum(s => s.kinds.other.total),
}));

const bankLink = (id: string) => `/bank?${new URLSearchParams({ tab: "reports", project: id, month: period.value })}`;
const levelRank = { critical: 0, warning: 1, info: 2 } as const;
const cards = computed(() => projects.value.map(p => {
  const s = summaries.value[p.id]!, prev = previousOf(p.id);
  return {
    ...p, s,
    color: finance.colorOf(p.id),
    warnings: (finance.issues.value[p.id] ?? []).filter(i => i.level !== "info").length,
    delta: prev?.hasData ? relativeChange(s.cost, prev.cost) : null,
    spark: finance.trendOf(p.id).map(point => point.hasData ? point.cost : null),
  };
}));

const chart = computed(() => {
  const window = finance.data.value?.window ?? [];
  return {
    labels: window.map(p => periodLabel(p, true)),
    details: window.map(p => periodLabel(p)),
    series: projects.value.map(p => ({ key: p.id, label: p.name, color: finance.colorOf(p.id), values: finance.trendOf(p.id).map(point => point.hasData ? point.cost : null) })),
  };
});

const showAllIssues = ref(false);
const attention = computed(() => projects.value
  .flatMap(p => (finance.issues.value[p.id] ?? []).map((issue: FinanceIssue) => ({ issue, project: p.name, color: finance.colorOf(p.id), to: ctx.issueLink(issue.code, p.id) })))
  .sort((a, b) => levelRank[a.issue.level] - levelRank[b.issue.level]));
const shownAttention = computed(() => showAllIssues.value ? attention.value : attention.value.filter(i => i.issue.level !== "info").slice(0, 8));

type Cell = { value: number | null; to?: string };
type Row = { key: string; label: string; kind?: "money" | "percent" | "count"; cells: Cell[]; total: number | null; previous?: number | null; style?: "subtotal" | "result" | "muted" | "sub"; goodWhen?: "up" | "down" } | { section: string };
const table = computed<Row[]>(() => {
  const ps = projects.value;
  const cells = (pick: (s: FinanceSummary) => number | null, link?: (id: string) => string) => ps.map(p => ({ value: pick(summaries.value[p.id]!), to: link?.(p.id) }));
  const category = (key: Exclude<FinanceCategory, "revenue">) => ({
    key, label: FINANCE_CATEGORIES[key],
    cells: cells(s => s.categories.find(c => c.key === key)?.amount ?? null, id => ctx.financeLink(id, { category: key }, "#ledger")),
    total: total.value.categories.find(c => c.key === key)?.amount ?? null,
    previous: previousTotal(p => p.categories[key] ?? 0),
  });
  const operatingLines = PNL_ORDER.filter(k => k !== "equipment" && k !== "deposit").map(category).filter(r => r.total !== null);
  const capitalLines = (["equipment", "deposit"] as const).map(category).filter(r => r.total !== null);
  const unitLink = (id: string) => `/unit-economics?month=${period.value}#metrics-${id}`;
  return [
    { section: "Төлемдер — ақша қалай кетті" },
    { key: "salary", label: "Айлық (ФОТ)", cells: cells(s => s.kinds.salary.total, id => ctx.payrollLink("/departments", id)), total: totals.value.salary, previous: previousTotal(p => p.kinds.salary), style: "subtotal" },
    { key: "salary-unpaid", label: "оның ішінде төленбеген", cells: cells(s => s.kinds.salary.unpaid, id => ctx.payrollLink("/departments", id, "#payment-queue")), total: totals.value.salaryUnpaid, style: "sub" },
    { key: "mandatory", label: "Міндетті төлемдер", cells: cells(s => s.kinds.mandatory.total, id => ctx.payrollLink("/expenses", id)), total: totals.value.mandatory, previous: previousTotal(p => p.kinds.mandatory), style: "subtotal" },
    { key: "mandatory-unpaid", label: "оның ішінде төленбеген", cells: cells(s => s.kinds.mandatory.unpaid, id => ctx.payrollLink("/expenses", id)), total: totals.value.mandatoryUnpaid, style: "sub" },
    { key: "target", label: "Таргет (Facebook) — жұмсалды", cells: cells(s => s.kinds.target.total, id => ctx.financeLink(id, { kind: "target" }, "#ledger")), total: totals.value.target, previous: previousTotal(p => p.kinds.target), style: "subtotal" },
    { key: "other", label: "Басқа шығындар — жұмсалды", cells: cells(s => s.kinds.other.total, id => ctx.financeLink(id, { kind: "other" }, "#ledger")), total: totals.value.other, previous: previousTotal(p => p.kinds.other), style: "subtotal" },
    { key: "cost", label: "Айдың шығыны, барлығы", cells: cells(s => s.cost, id => ctx.financeLink(id, {}, "#pnl")), total: total.value.cost, previous: previousTotal(p => p.cost), style: "result" },
    { section: "P&L — шығын түрлері бойынша" },
    ...(Object.values(summaries.value).some(s => s.bank) ? [{ key: "gross", label: "Валовой оборот (выписка)", cells: ps.map(p => ({ value: summaries.value[p.id]!.bank?.gross ?? null, to: bankLink(p.id) })), total: total.value.bank?.gross ?? null, style: "muted" as const, goodWhen: "up" as const }] : []),
    { key: "revenue", label: "Табыс (выписка бар болса — таза түсім)", cells: ps.map(p => ({ value: summaries.value[p.id]!.revenue, to: summaries.value[p.id]!.revenueSource === "bank" ? bankLink(p.id) : unitLink(p.id) })), total: total.value.revenue, style: "subtotal", goodWhen: "up" },
    ...operatingLines,
    { key: "operating", label: "Операциялық шығын", cells: cells(s => s.operating), total: total.value.operating, previous: previousTotal(p => p.operating), style: "subtotal" },
    { key: "profit", label: "Операциялық нәтиже", cells: cells(s => s.profit, id => ctx.financeLink(id, {}, "#pnl")), total: total.value.profit, style: "result", goodWhen: "up" },
    { key: "margin", label: "Маржа", kind: "percent", cells: cells(s => s.margin), total: total.value.margin, style: "muted" },
    ...(capitalLines.length ? [{ section: "Капитал (нәтижеге кірмейді)" }, ...capitalLines] : []),
    { section: "Юнит және таргет" },
    { key: "headcount", label: "Қызметкерлер (айлығы бар)", kind: "count", cells: cells(s => s.payroll.headcount, id => ctx.payrollLink("/departments", id)), total: sum(s => s.payroll.headcount), style: "muted" },
    { key: "units", label: "Оқушы / клиент", kind: "count", cells: cells(s => s.unit.units, unitLink), total: null, style: "muted" },
    { key: "arpu", label: "ARPU — бір оқушы табысы", cells: cells(s => s.unit.arpu, unitLink), total: null, style: "muted" },
    { key: "leads", label: "Лидтер", kind: "count", cells: cells(s => s.funnel.leads, unitLink), total: total.value.funnel.leads, style: "muted" },
    { key: "cpl", label: "CPL — бір лид құны", cells: cells(s => s.funnel.cpl, unitLink), total: total.value.funnel.cpl, style: "muted" },
    { key: "cac", label: "CAC — бір клиент құны", cells: cells(s => s.funnel.cac, unitLink), total: total.value.funnel.cac, style: "muted" },
  ];
});
function cell(value: number | null, kind: "money" | "percent" | "count" = "money") {
  return kind === "percent" ? formatPercent(value) : kind === "count" ? formatCount(value) : money(value);
}
function deltaClass(row: Exclude<Row, { section: string }>) {
  const d = relativeChange(row.total, row.previous);
  if (d === null || Math.abs(d) < 0.0005) return "flat";
  return (d > 0) === ((row.goodWhen ?? "down") === "up") ? "good" : "bad";
}
const share = (paid: number, all: number) => all > 0 ? paid / all : null;
</script>

<template>
  <div class="analytics-page">
    <AnalyticsHeader />
    <p v-if="finance.error.value" class="finance-error" role="alert">{{ finance.error.value }} <button type="button" @click="finance.load">{{ t("Қайта жүктеу") }}</button></p>
    <div v-if="!finance.data.value" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="kpi-row" :aria-label="t('Барлық жоба бойынша негізгі көрсеткіштер')" :class="{ stale: !finance.fresh.value }">
        <KpiTile tone="brand" :label="t('Айдың барлық шығыны')" :value="money(total.cost)" :sub="`${projects.length} ${t('жоба')} · ${t('жұмсалды')} ${compactMoney(total.paid)}`" :delta="relativeChange(total.cost, previousTotal(p => p.cost))" />
        <KpiTile :label="t('Айлық төлемі')" :value="money(totals.salary)" :progress="share(totals.salaryPaid, totals.salary)" :sub="totals.salaryUnpaid ? `${t('Төленді')} ${compactMoney(totals.salaryPaid)} · ${t('қалды')} ${compactMoney(totals.salaryUnpaid)} (${totals.salaryPeople} ${t('адам')})` : t('Барлық айлық төленді')" />
        <KpiTile :label="t('Міндетті төлемдер')" :value="money(totals.mandatory)" :progress="share(totals.mandatoryPaid, totals.mandatory)" :sub="totals.mandatoryUnpaid ? `${t('Төленді')} ${compactMoney(totals.mandatoryPaid)} · ${t('қалды')} ${compactMoney(totals.mandatoryUnpaid)} (${totals.mandatoryItems} ${t('төлем')})` : t('Аренда, интернет, подписка — төленді')" />
        <KpiTile :label="t('Таргет + басқа шығындар')" :value="money(totals.target + totals.other)" :sub="`${t('Таргет')} ${compactMoney(totals.target)} · ${t('басқа')} ${compactMoney(totals.other)} — ${t('жұмсалды')}`" :delta="relativeChange(totals.target + totals.other, previousTotal(p => p.kinds.target + p.kinds.other))" />
        <KpiTile v-if="total.profit !== null" :tone="total.profit < 0 ? 'danger' : 'success'" :label="t('Операциялық нәтиже')" :value="money(total.profit)" :sub="`${t('Маржа')} ${formatPercent(total.margin)}`" good-when="up" />
        <KpiTile v-else :label="t('Операциялық нәтиже')" :value="`${t('Табыс')} ${total.revenueCoverage}/${projects.length}`" :sub="t('Барлық жобаның табысы енгізілгенде есептеледі')" />
      </section>

      <section class="project-grid" :aria-label="t('Жобалар')">
        <article v-for="c in cards" :key="c.id" class="project-card" :style="{ '--project': c.color }" :class="{ stale: !finance.fresh.value }">
          <header>
            <NuxtLink :to="ctx.financeLink(c.id)" class="project-name"><i />{{ c.name }}<ArrowUpRight :size="15" /></NuxtLink>
            <NuxtLink v-if="c.warnings" :to="ctx.financeLink(c.id, {}, '#issues')" class="project-flag">{{ c.warnings }} {{ t("ескерту") }}</NuxtLink>
          </header>
          <NuxtLink :to="ctx.financeLink(c.id, {}, '#pnl')" class="project-main">
            <small>{{ t("Айдың шығыны") }}</small>
            <strong>{{ money(c.s.cost) }}</strong>
            <span v-if="c.delta !== null" class="project-delta" :class="c.delta > 0 ? 'bad' : 'good'">{{ c.delta > 0 ? "▲" : "▼" }} {{ formatDelta(c.delta) }} {{ t("өткен айға") }}</span>
            <span v-else class="project-delta">{{ t("Өткен айда дерек жоқ") }}</span>
          </NuxtLink>
          <ChartSparkline :values="c.spark" :color="c.color" />
          <div class="project-rows">
            <NuxtLink :to="ctx.payrollLink('/departments', c.id, '#payment-queue')" class="project-row">
              <span>{{ t("Айлық") }}</span>
              <b>{{ money(c.s.kinds.salary.total) }}</b>
              <small v-if="c.s.kinds.salary.unpaid" class="owed">{{ t("қалды") }} {{ compactMoney(c.s.kinds.salary.unpaid) }} · {{ c.s.kinds.salary.unpaidCount }} {{ t("адам") }}</small>
              <small v-else-if="c.s.kinds.salary.total" class="done">{{ t("төленді") }}</small>
              <small v-else>{{ t("айлық жоқ") }}</small>
            </NuxtLink>
            <NuxtLink :to="ctx.payrollLink('/expenses', c.id)" class="project-row">
              <span>{{ t("Міндетті төлемдер") }}</span>
              <b>{{ money(c.s.kinds.mandatory.total) }}</b>
              <small v-if="c.s.kinds.mandatory.unpaid" class="owed">{{ t("қалды") }} {{ compactMoney(c.s.kinds.mandatory.unpaid) }} · {{ c.s.kinds.mandatory.unpaidCount }} {{ t("төлем") }}</small>
              <small v-else-if="c.s.kinds.mandatory.total" class="done">{{ t("төленді") }}</small>
              <small v-else>{{ t("енгізілмеген") }}</small>
            </NuxtLink>
            <NuxtLink :to="ctx.financeLink(c.id, { kind: 'target' }, '#ledger')" class="project-row">
              <span>{{ t("Таргет (Facebook)") }}</span><b>{{ money(c.s.kinds.target.total) }}</b><small>{{ t("жұмсалды") }}</small>
            </NuxtLink>
            <NuxtLink :to="ctx.financeLink(c.id, { kind: 'other' }, '#ledger')" class="project-row">
              <span>{{ t("Басқа шығындар") }}</span><b>{{ money(c.s.kinds.other.total) }}</b><small>{{ c.s.kinds.other.count }} {{ t("жазба") }}</small>
            </NuxtLink>
            <NuxtLink v-if="c.s.profit !== null" :to="ctx.financeLink(c.id, {}, c.s.revenueSource === 'bank' ? '#receipts' : '#pnl')" class="project-row">
              <span>{{ t("Нәтиже") }}</span><b :class="{ negative: c.s.profit < 0 }">{{ money(c.s.profit) }}</b><small :class="{ 'from-bank': c.s.revenueSource === 'bank' }">{{ t("табыс") }} {{ compactMoney(c.s.revenue) }} · {{ c.s.revenueSource === "bank" ? t("выписка бойынша") : t("қолмен") }} · {{ t("маржа") }} {{ formatPercent(c.s.margin, 0) }}</small>
            </NuxtLink>
            <NuxtLink v-else :to="`/unit-economics?month=${period}#metrics-${c.id}`" class="project-row missing">
              <span>{{ t("Нәтиже") }}</span><b>{{ t("Табыс енгізу") }}</b><small>{{ t("табыс жоқ") }}</small>
            </NuxtLink>
          </div>
          <footer>
            <div class="paid-meter" role="img" :aria-label="`${t('Айлық пен міндетті төлемдер: төленді')} ${formatPercent(c.s.obligations.share ?? 0, 0)}`"><i :style="{ width: `${Math.min(100, (c.s.obligations.share ?? 0) * 100)}%` }" /></div>
            <small v-if="c.s.obligations.total">{{ t("Айлық + міндетті: төленді") }} {{ formatPercent(c.s.obligations.share, 0) }} · {{ t("қалды") }} {{ compactMoney(c.s.obligations.unpaid) }}</small>
            <small v-else>{{ t("Бұл айда айлық пен міндетті төлем жоқ") }}</small>
          </footer>
        </article>
      </section>

      <div class="analytics-columns">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("Динамика") }}</span><h2>{{ t("Шығын жобалар бойынша, 6 ай") }}</h2></div><small class="panel-note">{{ t("Әр жобаның бағаны бөлек") }}</small></header>
          <ChartColumns :caption="t('Айлық шығын жобалар бойынша')" grouped :labels="chart.labels" :details="chart.details" :series="chart.series" :format="money" :axis-format="compactMoney" />
        </section>
        <section class="panel analytics-panel">
          <header>
            <div><span class="eyebrow">{{ t("Бақылау") }}</span><h2>{{ t("Назар аударыңыз") }}</h2></div>
            <button v-if="attention.length > shownAttention.length || showAllIssues" type="button" class="text-button" @click="showAllIssues = !showAllIssues">{{ showAllIssues ? t("Қысқаша") : `${t("Барлығы")} (${attention.length})` }}</button>
          </header>
          <FinanceIssueList :items="shownAttention" />
        </section>
      </div>

      <section class="panel analytics-panel">
        <header>
          <div><span class="eyebrow">P&amp;L · {{ periodLabel(period) }}</span><h2>{{ t("Жобалар бойынша айлық есеп") }}</h2></div>
          <small class="panel-note">{{ t("Санды басып, толық тізімін ашыңыз · салыстыру:") }} {{ periodLabel(shiftPeriod(period, -1)) }}</small>
        </header>
        <div class="table-scroll">
          <table class="pnl-table">
            <thead>
              <tr>
                <th scope="col">{{ t("Көрсеткіш") }}</th>
                <th v-for="p in projects" :key="p.id" scope="col"><NuxtLink :to="ctx.financeLink(p.id)"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</NuxtLink></th>
                <th scope="col" class="total-col">{{ t("Барлығы") }}</th>
                <th scope="col">{{ t("Өткен ай") }}</th>
                <th scope="col">{{ t("Өзгеріс") }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(row, index) in table" :key="'section' in row ? `s${index}` : row.key">
                <tr v-if="'section' in row" class="pnl-section"><th :colspan="projects.length + 4" scope="rowgroup">{{ t(row.section) }}</th></tr>
                <tr v-else :class="row.style">
                  <th scope="row">{{ t(row.label) }}</th>
                  <td v-for="(c, i) in row.cells" :key="i" :class="{ negative: row.key === 'profit' && c.value !== null && c.value < 0, owed: row.style === 'sub' && (c.value ?? 0) > 0 }">
                    <NuxtLink v-if="c.to && c.value !== null && c.value !== 0" :to="c.to" class="cell-link">{{ cell(c.value, row.kind) }}</NuxtLink>
                    <template v-else>{{ cell(c.value, row.kind) }}</template>
                  </td>
                  <td class="total-col" :class="{ negative: row.key === 'profit' && row.total !== null && row.total < 0 }">{{ cell(row.total, row.kind) }}</td>
                  <td>{{ row.previous === undefined ? "" : cell(row.previous, row.kind) }}</td>
                  <td><span v-if="row.previous !== undefined && relativeChange(row.total, row.previous) !== null" class="delta-chip" :class="deltaClass(row)">{{ (relativeChange(row.total, row.previous) ?? 0) > 0 ? "+" : "−" }}{{ formatDelta(relativeChange(row.total, row.previous) ?? 0) }}</span></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">{{ t("Айлық пен міндетті төлемдер «төленді / төленбеді» болып бөлінеді; таргет пен басқа шығындар — жұмсалған ақша. Айлық пен міндетті төлем сілтемелері сол жобаның Payroll бетін ашады. «—» — дерек енгізілмеген.") }}</p>
      </section>
    </template>
  </div>
</template>
