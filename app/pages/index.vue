<script setup lang="ts">
import { ArrowRight, CirclePlus, RefreshCw } from "lucide-vue-next";
import { FINANCE_CATEGORIES, PNL_ORDER, type FinanceCategory, type FinanceEntry, type FinanceIssue } from "../../lib/finance";

const finance = useFinance();
const { projects, summaries, total, period } = finance;
onMounted(finance.load);

const entryDraft = ref<Partial<FinanceEntry> | null>(null);
const showAllIssues = ref(false);

const previousPeriod = computed(() => shiftPeriod(period.value, -1));
/** Previous-month totals across projects, taken from the trend window (same definitions as the current month). */
const previous = computed(() => {
  const points = projects.value.map(p => finance.previousOf(p.id)).filter(p => p !== null);
  const add = (pick: (p: (typeof points)[number]) => number | null) => points.length ? points.reduce((a, p) => a + (pick(p) ?? 0), 0) : null;
  return {
    cost: add(p => p.cost),
    operating: add(p => p.operating),
    payroll: add(p => p.groups.payroll),
    marketing: add(p => p.groups.marketing),
    category: (key: FinanceCategory) => add(p => p.categories[key] ?? 0),
  };
});

const headcount = computed(() => projects.value.reduce((a, p) => a + (summaries.value[p.id]?.payroll.headcount ?? 0), 0));
const cards = computed(() => projects.value.map(p => {
  const s = summaries.value[p.id]!, prev = finance.previousOf(p.id), trend = finance.trendOf(p.id);
  const warnings = (finance.issues.value[p.id] ?? []).filter(i => i.level !== "info").length;
  return {
    ...p, s, warnings,
    color: finance.colorOf(p.id),
    delta: prev?.hasData ? relativeChange(s.cost, prev.cost) : null,
    spark: trend.map(t => t.hasData ? t.cost : null),
    paidShare: s.cost > 0 ? s.paid / s.cost : 0,
  };
}));

const chart = computed(() => {
  const window = finance.data.value?.window ?? [];
  return {
    labels: window.map(p => periodLabel(p, true)),
    details: window.map(p => periodLabel(p)),
    series: projects.value.map(p => ({
      key: p.id, label: p.name, color: finance.colorOf(p.id),
      values: finance.trendOf(p.id).map(t => t.hasData ? t.cost : null),
    })),
  };
});

const levelRank = { critical: 0, warning: 1, info: 2 } as const;
const metricIssues = new Set(["no-revenue", "no-leads", "no-customers", "no-units", "leads-without-spend"]);
const attention = computed(() => projects.value
  .flatMap(p => (finance.issues.value[p.id] ?? []).map((issue: FinanceIssue) => ({
    issue, project: p.name, color: finance.colorOf(p.id),
    to: `${metricIssues.has(issue.code) ? "/unit-economics" : "/finance"}?project=${p.id}&period=${period.value}`,
  })))
  .sort((a, b) => levelRank[a.issue.level] - levelRank[b.issue.level]));
const shownAttention = computed(() => showAllIssues.value ? attention.value : attention.value.filter(i => i.issue.level !== "info").slice(0, 7));

type Row = { key: string; label: string; kind?: "money" | "percent" | "count"; values: Array<number | null>; total: number | null; previous?: number | null; style?: "subtotal" | "result" | "muted"; goodWhen?: "up" | "down" } | { section: string };
const pnl = computed<Row[]>(() => {
  const list = projects.value.map(p => summaries.value[p.id]!);
  const line = (key: Exclude<FinanceCategory, "revenue">) => ({
    key, label: FINANCE_CATEGORIES[key],
    values: list.map(s => s.categories.find(c => c.key === key)?.amount ?? null),
    total: total.value.categories.find(c => c.key === key)?.amount ?? null,
    previous: previous.value.category(key),
  });
  const operatingLines = PNL_ORDER.filter(k => k !== "equipment" && k !== "deposit").map(line).filter(r => r.total !== null || r.previous);
  const capitalLines = (["equipment", "deposit"] as const).map(line).filter(r => r.total !== null || r.previous);
  const rows: Row[] = [
    { section: "Табыс" },
    { key: "revenue", label: "Табыс (танылған)", values: list.map(s => s.revenue), total: total.value.revenue, style: "subtotal", goodWhen: "up" },
    { section: "Операциялық шығындар" },
    ...operatingLines,
    { key: "operating", label: "Операциялық шығын, барлығы", values: list.map(s => s.operating), total: total.value.operating, previous: previous.value.operating, style: "subtotal" },
    { key: "profit", label: "Операциялық нәтиже", values: list.map(s => s.profit), total: total.value.profit, style: "result", goodWhen: "up" },
    { key: "margin", label: "Операциялық маржа", kind: "percent", values: list.map(s => s.margin), total: total.value.margin, style: "muted" },
  ];
  if (capitalLines.length) rows.push({ section: "Капитал салымы (нәтижеге кірмейді)" }, ...capitalLines);
  rows.push(
    { key: "cost", label: "Барлық ақша шығыны", values: list.map(s => s.cost), total: total.value.cost, previous: previous.value.cost, style: "subtotal" },
    { section: "Төлем күйі" },
    { key: "paid", label: "Төленді", values: list.map(s => s.paid), total: total.value.paid, style: "muted" },
    { key: "unpaid", label: "Төленуі керек", values: list.map(s => s.unpaid), total: total.value.unpaid, style: "muted" },
    { key: "unknown", label: "Күйі расталмаған", values: list.map(s => s.unknown), total: total.value.unknown, style: "muted" },
    { section: "Юнит және таргет" },
    { key: "headcount", label: "Қызметкерлер (айлығы бар)", kind: "count", values: list.map(s => s.payroll.headcount), total: headcount.value, style: "muted" },
    { key: "units", label: "Оқушы / клиент", kind: "count", values: list.map(s => s.unit.units), total: null, style: "muted" },
    { key: "arpu", label: "ARPU — бір оқушы табысы", values: list.map(s => s.unit.arpu), total: null, style: "muted" },
    { key: "unitCost", label: "Бір оқушыға шығын", values: list.map(s => s.unit.costPerUnit), total: null, style: "muted" },
    { key: "leads", label: "Лидтер", kind: "count", values: list.map(s => s.funnel.leads), total: total.value.funnel.leads, style: "muted" },
    { key: "cpl", label: "CPL — лид құны", values: list.map(s => s.funnel.cpl), total: total.value.funnel.cpl, style: "muted" },
    { key: "cac", label: "CAC — клиент тарту құны", values: list.map(s => s.funnel.cac), total: total.value.funnel.cac, style: "muted" },
  );
  return rows;
});
function cell(value: number | null, kind: "money" | "percent" | "count" = "money") {
  return kind === "percent" ? formatPercent(value) : kind === "count" ? formatCount(value) : money(value);
}
function deltaClass(row: Exclude<Row, { section: string }>) {
  const d = relativeChange(row.total, row.previous);
  if (d === null || Math.abs(d) < 0.0005) return "flat";
  return (d > 0) === ((row.goodWhen ?? "down") === "up") ? "good" : "bad";
}
function addEntry() {
  entryDraft.value = { workspaceId: projects.value[0]?.id, period: period.value, name: "", category: "other", amount: null, basis: "actual", status: "paid", disposition: "included", source: "Қолмен енгізілген", note: "", relatedId: "", currency: "KZT" };
}
</script>

<template>
  <div class="analytics-page">
    <header class="analytics-header">
      <div>
        <span class="eyebrow">Басқару есебі · {{ projects.length }} жоба</span>
        <h1>Қаржылық шолу</h1>
        <p>Әр жобаның айлық шығыны, ФОТ, таргет және нәтижесі бір экранда</p>
      </div>
      <div class="analytics-actions">
        <FinancePeriodControl />
        <button class="button secondary icon-only" type="button" aria-label="Жаңарту" :disabled="finance.loading.value" @click="finance.load"><RefreshCw :size="17" :class="{ spin: finance.loading.value }" /></button>
        <button class="button primary" type="button" :disabled="!finance.data.value" @click="addEntry"><CirclePlus :size="17" /> Шығын қосу</button>
      </div>
    </header>

    <p v-if="finance.error.value" class="finance-error" role="alert">{{ finance.error.value }} <button type="button" @click="finance.load">Қайта жүктеу</button></p>
    <div v-if="!finance.data.value" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="kpi-row" aria-label="Негізгі көрсеткіштер" :class="{ stale: !finance.fresh.value }">
        <KpiTile tone="brand" label="Айдың барлық шығыны" :value="money(total.cost)" :sub="`Операциялық ${compactMoney(total.operating)} · капитал ${compactMoney(total.capital)}`" :delta="relativeChange(total.cost, previous.cost)" />
        <KpiTile label="ФОТ — айлық қоры" :value="money(total.groups.payroll)" :sub="`${headcount} адам · шығынның ${formatPercent(total.cost ? total.groups.payroll / total.cost : null, 0)}`" :delta="relativeChange(total.groups.payroll, previous.payroll)" />
        <KpiTile label="Таргет / маркетинг" :value="money(total.groups.marketing)" :sub="total.funnel.cpl !== null ? `CPL ${money(total.funnel.cpl)} · CAC ${money(total.funnel.cac)}` : 'Лидтер барлық жобада енгізілмеген'" :delta="relativeChange(total.groups.marketing, previous.marketing)" />
        <KpiTile v-if="total.profit !== null" :tone="total.profit < 0 ? 'danger' : 'success'" label="Операциялық нәтиже" :value="money(total.profit)" :sub="`Маржа ${formatPercent(total.margin)}`" good-when="up" />
        <KpiTile v-else label="Операциялық нәтиже" :value="`Табыс ${total.revenueCoverage}/${projects.length}`" sub="Барлық жобаның табысы енгізілгенде есептеледі" />
        <KpiTile label="Төленуі керек" :value="money(total.unpaid)" :sub="`Күйі расталмаған: ${compactMoney(total.unknown)}`" />
      </section>

      <section class="project-grid" aria-label="Жобалар">
        <NuxtLink v-for="c in cards" :key="c.id" :to="`/finance?project=${c.id}&period=${period}`" class="project-card" :style="{ '--project': c.color }">
          <header>
            <span class="project-name"><i />{{ c.name }}</span>
            <span v-if="c.warnings" class="project-flag">{{ c.warnings }} ескерту</span>
          </header>
          <div class="project-main">
            <small>Айдың шығыны</small>
            <strong>{{ money(c.s.cost) }}</strong>
            <span v-if="c.delta !== null" class="project-delta" :class="c.delta > 0 ? 'bad' : 'good'">{{ c.delta > 0 ? "▲" : "▼" }} {{ formatDelta(c.delta) }} өткен айға</span>
            <span v-else class="project-delta">Өткен айда дерек жоқ</span>
          </div>
          <ChartSparkline :values="c.spark" :color="c.color" />
          <dl>
            <div><dt>ФОТ</dt><dd>{{ money(c.s.groups.payroll) }}</dd></div>
            <div><dt>Таргет</dt><dd>{{ money(c.s.groups.marketing) }}</dd></div>
            <div><dt>Операциялық</dt><dd>{{ money(c.s.groups.opex + c.s.groups.tax) }}</dd></div>
            <div v-if="c.s.profit !== null"><dt>Нәтиже · {{ formatPercent(c.s.margin, 0) }}</dt><dd :class="{ negative: c.s.profit < 0 }">{{ money(c.s.profit) }}</dd></div>
            <div v-else><dt>Нәтиже</dt><dd class="muted">табыс енгізілмеген</dd></div>
          </dl>
          <footer>
            <div class="paid-meter" role="img" :aria-label="`Төленді ${formatPercent(c.paidShare, 0)}`"><i :style="{ width: `${Math.min(100, c.paidShare * 100)}%` }" /></div>
            <small>Төленді {{ formatPercent(c.paidShare, 0) }} · қалды {{ compactMoney(c.s.unpaid + c.s.unknown) }}</small>
            <ArrowRight :size="16" />
          </footer>
        </NuxtLink>
      </section>

      <div class="analytics-columns">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Динамика</span><h2>Шығын жобалар бойынша, 6 ай</h2></div></header>
          <ChartColumns
            caption="Айлық шығын жобалар бойынша"
            :labels="chart.labels" :details="chart.details" :series="chart.series"
            :format="money" :axis-format="compactMoney"
          />
        </section>
        <section class="panel analytics-panel">
          <header>
            <div><span class="eyebrow">Бақылау</span><h2>Назар аударыңыз</h2></div>
            <button v-if="attention.length > shownAttention.length || showAllIssues" type="button" class="text-button" @click="showAllIssues = !showAllIssues">{{ showAllIssues ? "Қысқаша" : `Барлығы (${attention.length})` }}</button>
          </header>
          <FinanceIssueList :items="shownAttention" />
        </section>
      </div>

      <section class="panel analytics-panel">
        <header>
          <div><span class="eyebrow">P&amp;L · {{ periodLabel(period) }}</span><h2>Жобалар бойынша айлық есеп</h2></div>
          <small class="panel-note">Салыстыру: {{ periodLabel(previousPeriod) }}</small>
        </header>
        <div class="table-scroll">
          <table class="pnl-table">
            <thead>
              <tr>
                <th scope="col">Көрсеткіш</th>
                <th v-for="p in projects" :key="p.id" scope="col"><NuxtLink :to="`/finance?project=${p.id}&period=${period}`"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</NuxtLink></th>
                <th scope="col" class="total-col">Барлығы</th>
                <th scope="col">Өткен ай</th>
                <th scope="col">Өзгеріс</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(row, index) in pnl" :key="'section' in row ? `s${index}` : row.key">
                <tr v-if="'section' in row" class="pnl-section"><th :colspan="projects.length + 4" scope="rowgroup">{{ row.section }}</th></tr>
                <tr v-else :class="row.style">
                  <th scope="row">{{ row.label }}</th>
                  <td v-for="(value, i) in row.values" :key="i" :class="{ negative: row.key === 'profit' && value !== null && value < 0 }">{{ cell(value, row.kind) }}</td>
                  <td class="total-col" :class="{ negative: row.key === 'profit' && row.total !== null && row.total < 0 }">{{ cell(row.total, row.kind) }}</td>
                  <td>{{ row.previous === undefined ? "" : cell(row.previous, row.kind) }}</td>
                  <td><span v-if="row.previous !== undefined && relativeChange(row.total, row.previous) !== null" class="delta-chip" :class="deltaClass(row)">{{ (relativeChange(row.total, row.previous) ?? 0) > 0 ? "+" : "−" }}{{ formatDelta(relativeChange(row.total, row.previous) ?? 0) }}</span></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">Табыс — «Юнит және таргет» бетінде енгізілген сома. Жабдық пен депозит ақша шығынына кіреді, бірақ операциялық нәтижеге кірмейді. «—» — дерек енгізілмеген (нөл емес).</p>
      </section>
    </template>

    <FinanceEntryModal v-if="entryDraft" :entry="entryDraft" @close="entryDraft = null" @saved="entryDraft = null" />
  </div>
</template>
