<script setup lang="ts">
import { ArrowDownToLine, ArrowRight, CirclePlus, Pencil, RefreshCw } from "lucide-vue-next";
import { COST_GROUPS, FINANCE_CATEGORIES, isOperatingCost, type CostGroup, type FinanceEntry, type FinanceTrendPoint } from "../../lib/finance";

const route = useRoute();
const payroll = usePayroll();
const finance = useFinance();
const { projects, summaries, total, period } = finance;
onMounted(finance.load);

const project = ref(typeof route.query.project === "string" ? route.query.project : "");
// Keep the requested project until the project list is known; fall back only if it does not exist.
watch(projects, list => {
  if (list.length && project.value !== "all" && !list.some(p => p.id === project.value)) project.value = list[0]!.id;
}, { immediate: true });
watch(project, id => navigateTo({ query: { ...route.query, project: id } }, { replace: true }));
const isAll = computed(() => project.value === "all");
const summary = computed(() => isAll.value ? total.value : summaries.value[project.value] ?? null);
const metrics = computed(() => isAll.value ? null : finance.metricsOf(project.value));
const accent = computed(() => isAll.value ? "#495cf8" : finance.colorOf(project.value));

/** Trend for the view: one project, or the sum of all projects month by month. */
const trend = computed<FinanceTrendPoint[]>(() => {
  if (!isAll.value) return finance.trendOf(project.value);
  const lists = projects.value.map(p => finance.trendOf(p.id));
  return (finance.data.value?.window ?? []).map((p, i) => {
    const points = lists.map(list => list[i]).filter((x): x is FinanceTrendPoint => !!x);
    const add = (pick: (x: FinanceTrendPoint) => number) => points.reduce((a, x) => a + pick(x), 0);
    const revenueKnown = points.length > 0 && points.every(x => x.revenue !== null);
    const categories: FinanceTrendPoint["categories"] = {};
    for (const x of points) for (const [k, v] of Object.entries(x.categories)) categories[k as keyof typeof categories] = (categories[k as keyof typeof categories] ?? 0) + v;
    return {
      period: p, cost: add(x => x.cost), operating: add(x => x.operating), capital: add(x => x.capital),
      groups: Object.fromEntries((Object.keys(COST_GROUPS) as CostGroup[]).map(g => [g, add(x => x.groups[g])])) as Record<CostGroup, number>,
      categories, revenue: revenueKnown ? add(x => x.revenue ?? 0) : null, profit: revenueKnown ? add(x => x.profit ?? 0) : null,
      paid: add(x => x.paid), unpaid: add(x => x.unpaid), unknown: add(x => x.unknown), plan: null, headcount: add(x => x.headcount),
      leads: null, customers: null, units: null, cac: null, cpl: null, hasData: points.some(x => x.hasData),
    };
  });
});
const previous = computed(() => trend.value.length > 1 ? trend.value[trend.value.length - 2]! : null);
const prevValue = <T,>(pick: (p: FinanceTrendPoint) => T) => previous.value?.hasData ? pick(previous.value) : null;

const chart = computed(() => ({
  labels: trend.value.map(t => periodLabel(t.period, true)),
  details: trend.value.map(t => periodLabel(t.period)),
  series: (Object.keys(COST_GROUPS) as CostGroup[]).map(g => ({ key: g, label: COST_GROUPS[g], color: GROUP_COLORS[g], values: trend.value.map(t => t.hasData ? t.groups[g] : null) })),
  line: trend.value.some(t => t.revenue !== null) ? { label: "Табыс", values: trend.value.map(t => t.revenue) } : null,
}));

const projectIssues = computed(() => isAll.value
  ? projects.value.flatMap(p => (finance.issues.value[p.id] ?? []).filter(i => i.level !== "info").map(issue => ({ issue, project: p.name, color: finance.colorOf(p.id) })))
  : (finance.issues.value[project.value] ?? []).map(issue => ({ issue })));

const pnlRows = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return s.categories.map(c => {
    const prev = prevValue(p => p.categories[c.key] ?? 0);
    return { ...c, previous: prev, delta: relativeChange(c.amount, prev), share: s.cost > 0 && c.amount ? c.amount / s.cost : null, execution: c.plan ? (c.amount ?? 0) / c.plan : null };
  });
});
const hasPlan = computed(() => pnlRows.value.some(r => r.plan !== null));

const payrollRows = computed(() => {
  if (!summary.value) return [];
  if (isAll.value) return projects.value.map(p => { const s = summaries.value[p.id]!; return { name: p.name, amount: s.payroll.total, headcount: s.payroll.headcount, paid: s.payroll.paid, unpaid: s.payroll.unpaid, color: finance.colorOf(p.id) }; }).filter(r => r.amount > 0);
  return summary.value.payroll.departments.filter(d => d.amount > 0).map(d => ({ ...d, color: accent.value }));
});
const payrollMax = computed(() => Math.max(1, ...payrollRows.value.map(r => r.amount)));
const unitName = computed(() => ({ client: "оқушы", order: "тапсырыс", service: "қызмет" })[metrics.value?.unitType ?? "client"]);
const unitTitle = computed(() => unitName.value.charAt(0).toLocaleUpperCase("kk-KZ") + unitName.value.slice(1));
function openPayroll() {
  openLive({ id: "", workspaceId: project.value, period: period.value, origin: "salary" } as FinanceEntry);
}

// Ledger
const view = ref<"actual" | "plan" | "review" | "duplicates">("actual");
const category = ref("all"), search = ref(""), page = ref(1);
const entryDraft = ref<Partial<FinanceEntry> | null>(null);
const actionError = ref("");
const viewEntries = computed(() => isAll.value ? finance.data.value?.entries ?? [] : finance.entriesOf(project.value));
const reviewCount = computed(() => viewEntries.value.filter(e => e.disposition === "review" || (e.disposition === "included" && e.amount === null)).length);
const rows = computed(() => viewEntries.value.filter(e =>
  (view.value === "review" ? e.disposition === "review" || (e.disposition === "included" && e.amount === null)
    : view.value === "duplicates" ? e.disposition === "duplicate" : e.disposition === "included" && e.basis === view.value)
  && (category.value === "all" || e.category === category.value)
  && `${e.name} ${e.note} ${e.source} ${e.group ?? ""}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)));
const shownRows = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25));
watch([project, view, category, search, period], () => { page.value = 1; });
const statusLabels = { paid: "Төленген", unpaid: "Төленбеген", unknown: "Расталмаған" };
const originLabels = { salary: "Payroll · айлық", expense: "Payroll · шығын", legacy: "Ескі юнит-экономика", import: "Excel импорт", manual: "Қолмен" };
const editable = (e: FinanceEntry) => e.origin === "import" || e.origin === "manual";

function addEntry(preset: Partial<FinanceEntry> = {}) {
  entryDraft.value = {
    workspaceId: isAll.value ? projects.value[0]?.id : project.value, period: period.value, name: "", category: "other", amount: null,
    basis: view.value === "plan" ? "plan" : "actual", status: "paid", disposition: "included", source: "Қолмен енгізілген", note: "", relatedId: "", currency: "KZT", ...preset,
  };
}
async function openLive(r: FinanceEntry) {
  await payroll.load(r.period, r.workspaceId);
  if (payroll.error.value || payroll.data.value?.selectedWorkspace.id !== r.workspaceId || payroll.data.value?.selectedMonth.id !== r.period) {
    actionError.value = "Payroll-да бұл жоба мен ай ашылмады.";
    return;
  }
  await navigateTo(r.origin === "salary" ? "/departments" : r.origin === "legacy" ? "/unit-economics" : r.note === "Басқа шығындар" ? "/other-expenses" : "/expenses");
}
async function classify(r: FinanceEntry, event: Event) {
  const target = event.target as HTMLSelectElement;
  actionError.value = await finance.classify(r, target.value);
  if (actionError.value) target.value = r.costBehavior || "fixed";
}
function exportRows() {
  const fields = ["Жоба", "Есептік ай", "Атауы", "Бөлім / топ", "Категория", "Сома, ₸", "USD", "Бағам", "Факт / жоспар", "Төлем күйі", "Есепке қосылуы", "Дереккөз", "Ескерту"];
  // Neutralize spreadsheet formula injection in user-authored text.
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const csv = "\uFEFF" + [fields, ...rows.value.map(e => [finance.nameOf(e.workspaceId), e.period, e.name, e.group ?? "", FINANCE_CATEGORIES[e.category], e.amount ?? "", e.currencyAmount ?? "", e.fxRate ?? "", e.basis === "plan" ? "Жоспар" : "Факт", statusLabels[e.status], e.disposition, e.source, e.note])]
    .map(r => r.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-${isAll.value ? "all" : finance.nameOf(project.value)}-${period.value}-${view.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="analytics-page" :style="{ '--project': accent }">
    <header class="analytics-header">
      <div>
        <span class="eyebrow">Жоба бойынша P&amp;L</span>
        <h1>{{ isAll ? "Барлық жоба" : finance.nameOf(project) }}</h1>
        <p>Шығын, табыс, ФОТ, таргет және юнит-экономика — {{ periodLabel(period) }}</p>
      </div>
      <div class="analytics-actions">
        <FinancePeriodControl />
        <button class="button secondary icon-only" type="button" aria-label="Жаңарту" :disabled="finance.loading.value" @click="finance.load"><RefreshCw :size="17" :class="{ spin: finance.loading.value }" /></button>
        <button class="button primary" type="button" :disabled="!finance.data.value" @click="addEntry()"><CirclePlus :size="17" /> Жазба қосу</button>
      </div>
    </header>

    <nav class="project-tabs" aria-label="Жобалар">
      <button v-for="p in projects" :key="p.id" type="button" :class="{ active: project === p.id }" :aria-pressed="project === p.id" @click="project = p.id"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</button>
      <button type="button" :class="{ active: isAll }" :aria-pressed="isAll" @click="project = 'all'">Барлығы</button>
    </nav>

    <p v-if="finance.error.value || actionError" class="finance-error" role="alert">{{ finance.error.value || actionError }}</p>
    <div v-if="!summary" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="kpi-row" aria-label="Негізгі көрсеткіштер" :class="{ stale: !finance.fresh.value }">
        <KpiTile tone="brand" label="Айдың шығыны" :value="money(summary.cost)" :sub="`Төленді ${compactMoney(summary.paid)} · қалды ${compactMoney(summary.unpaid + summary.unknown)}`" :delta="relativeChange(summary.cost, prevValue(p => p.cost))" />
        <KpiTile label="Табыс" :value="money(summary.revenue)" :sub="summary.revenue === null ? 'Юнит бетінде енгізіңіз' : summary.unit.arpu !== null ? `ARPU ${money(summary.unit.arpu)}` : summary.cashNet !== null ? `Түсім − төленген: ${compactMoney(summary.cashNet)}` : 'Танылған табыс'" :delta="relativeChange(summary.revenue, prevValue(p => p.revenue))" good-when="up" />
        <KpiTile label="Операциялық нәтиже" :tone="summary.profit === null ? 'default' : summary.profit < 0 ? 'danger' : 'success'" :value="money(summary.profit)" :sub="summary.margin === null ? 'Табыс − операциялық шығын' : `Маржа ${formatPercent(summary.margin)}`" :delta="relativeChange(summary.profit, prevValue(p => p.profit))" good-when="up" />
        <KpiTile label="ФОТ" :value="money(summary.groups.payroll)" :sub="`${summary.payroll.headcount} адам · орташа ${compactMoney(summary.payroll.average)}`" :delta="relativeChange(summary.groups.payroll, prevValue(p => p.groups.payroll))" />
        <KpiTile label="Таргет / маркетинг" :value="money(summary.groups.marketing)" :sub="summary.funnel.cpl !== null ? `CPL ${money(summary.funnel.cpl)} · CAC ${money(summary.funnel.cac)}` : 'Лид / клиент саны енгізілмеген'" :delta="relativeChange(summary.groups.marketing, prevValue(p => p.groups.marketing))" />
      </section>

      <div class="analytics-columns">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">6 ай</span><h2>Шығын құрылымы және табыс</h2></div></header>
          <ChartColumns caption="Шығын құрылымы айлар бойынша" :labels="chart.labels" :details="chart.details" :series="chart.series" :line="chart.line" :format="money" :axis-format="compactMoney" />
        </section>
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Деректер сапасы</span><h2>Не толтыру керек</h2></div><NuxtLink v-if="!isAll" :to="`/unit-economics?project=${project}&period=${period}`" class="text-button">Енгізу <ArrowRight :size="14" /></NuxtLink></header>
          <FinanceIssueList :items="projectIssues" />
        </section>
      </div>

      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">P&amp;L</span><h2>Шығындар санаттар бойынша</h2></div><small class="panel-note">Салыстыру: {{ periodLabel(shiftPeriod(period, -1)) }}</small></header>
        <div class="table-scroll">
          <table class="pnl-table detail">
            <thead><tr><th scope="col">Санат</th><th scope="col">Осы ай</th><th scope="col">Үлесі</th><th scope="col">Өткен ай</th><th scope="col">Өзгеріс</th><template v-if="hasPlan"><th scope="col">Жоспар</th><th scope="col">Орындалуы</th></template></tr></thead>
            <tbody>
              <tr class="subtotal"><th scope="row">Табыс</th><td>{{ money(summary.revenue) }}</td><td /><td>{{ money(prevValue(p => p.revenue)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr v-for="r in pnlRows" :key="r.key" :class="{ capital: r.group === 'capex' }">
                <th scope="row"><i class="group-dot" :style="{ background: GROUP_COLORS[r.group] }" />{{ r.name }}</th>
                <td>{{ money(r.amount) }}</td>
                <td><span v-if="r.share !== null" class="share-bar"><i :style="{ width: `${r.share * 100}%` }" />{{ formatPercent(r.share, 0) }}</span></td>
                <td>{{ money(r.previous) }}</td>
                <td><span v-if="r.delta !== null" class="delta-chip" :class="Math.abs(r.delta) < 0.0005 ? 'flat' : r.delta > 0 ? 'bad' : 'good'">{{ r.delta > 0 ? "+" : "−" }}{{ formatDelta(r.delta) }}</span></td>
                <template v-if="hasPlan"><td>{{ money(r.plan) }}</td><td><span v-if="r.execution !== null" class="delta-chip" :class="r.execution > 1.05 ? 'bad' : 'flat'">{{ formatPercent(r.execution, 0) }}</span></td></template>
              </tr>
              <tr class="subtotal"><th scope="row">Операциялық шығын</th><td>{{ money(summary.operating) }}</td><td /><td>{{ money(prevValue(p => p.operating)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="result"><th scope="row">Операциялық нәтиже</th><td :class="{ negative: (summary.profit ?? 0) < 0 }">{{ money(summary.profit) }}</td><td>{{ formatPercent(summary.margin) }}</td><td>{{ money(prevValue(p => p.profit)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="subtotal"><th scope="row">Барлық ақша шығыны</th><td>{{ money(summary.cost) }}</td><td /><td>{{ money(prevValue(p => p.cost)) }}</td><td /><template v-if="hasPlan"><td>{{ money(summary.plan) }}</td><td>{{ summary.plan ? formatPercent(summary.cost / summary.plan, 0) : "" }}</td></template></tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">Жоспар — жеке бюджет, фактке қосылмайды. Ай жабылмайынша жоспардан төмен факт үнем деп саналмайды.</p>
      </section>

      <div class="insight-grid">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">ЗП · ФОТ</span><h2>{{ isAll ? "Жобалар бойынша" : "Бөлімдер бойынша" }}</h2></div><button v-if="!isAll" type="button" class="text-button" :disabled="payroll.loading.value" @click="openPayroll">Payroll <ArrowRight :size="14" /></button></header>
          <dl class="stat-pairs">
            <div><dt>ФОТ барлығы</dt><dd>{{ money(summary.payroll.total) }}</dd></div>
            <div><dt>Адам саны</dt><dd>{{ formatCount(summary.payroll.headcount) }}</dd></div>
            <div><dt>Орташа айлық</dt><dd>{{ money(summary.payroll.average) }}</dd></div>
            <div><dt>Төленбеген</dt><dd :class="{ warn: summary.payroll.unpaid > 0 }">{{ money(summary.payroll.unpaid) }}</dd></div>
            <div v-if="summary.payroll.advances"><dt>Оның ішінде аванс</dt><dd>{{ money(summary.payroll.advances) }}</dd></div>
            <div v-if="summary.payrollShare !== null"><dt>ФОТ / табыс</dt><dd>{{ formatPercent(summary.payrollShare) }}</dd></div>
          </dl>
          <ul v-if="payrollRows.length" class="bar-list">
            <li v-for="r in payrollRows" :key="r.name">
              <div><span>{{ r.name }}</span><small>{{ r.headcount }} адам</small><b>{{ money(r.amount) }}</b></div>
              <span class="bar-track"><i :style="{ width: `${(r.amount / payrollMax) * 100}%`, background: r.color }" /></span>
              <small v-if="r.unpaid > 0" class="bar-note">Төленбеген: {{ money(r.unpaid) }}</small>
            </li>
          </ul>
          <p v-else class="panel-empty">Бұл айда айлық жазбалары жоқ.</p>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Таргет</span><h2>Маркетинг воронкасы</h2></div><button v-if="!isAll" type="button" class="text-button" @click="addEntry({ category: 'marketing', name: 'Таргет', currency: 'USD', status: 'paid' })"><CirclePlus :size="14" /> Таргет қосу</button></header>
          <div class="funnel">
            <div><small>Шығын</small><strong>{{ money(summary.funnel.spend) }}</strong><em v-if="summary.funnel.spendUsd">$ {{ formatCount(summary.funnel.spendUsd, 2) }}</em></div>
            <div><small>Лидтер</small><strong>{{ formatCount(summary.funnel.leads) }}</strong><em>CPL {{ money(summary.funnel.cpl) }}</em></div>
            <div><small>Жаңа клиенттер</small><strong>{{ formatCount(summary.funnel.customers) }}</strong><em>Конверсия {{ formatPercent(summary.funnel.conversion) }}</em></div>
          </div>
          <dl class="stat-pairs">
            <div><dt>CAC — клиент тарту құны</dt><dd>{{ money(summary.funnel.cac) }}</dd></div>
            <div><dt>Маркетинг / табыс</dt><dd>{{ formatPercent(summary.marketingShare) }}</dd></div>
            <div v-if="!isAll"><dt>ROMI {{ summary.unit.romiBasis === "ltv" ? "(LTV бойынша)" : "(1 ай)" }}</dt><dd>{{ formatPercent(summary.unit.romi, 0) }}</dd></div>
          </dl>
          <p v-if="!isAll && summary.funnel.spend && !summary.funnel.confirmed" class="panel-footnote">Таргет кезеңі мен лидтер кезеңі бірдей екені расталмаған.</p>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Юнит-экономика</span><h2>Бір {{ unitName }} есебі</h2></div><NuxtLink v-if="!isAll" :to="`/unit-economics?project=${project}&period=${period}`" class="text-button">Толығырақ <ArrowRight :size="14" /></NuxtLink></header>
          <p v-if="isAll" class="panel-empty">Юнит-экономика әр жоба бойынша бөлек есептеледі — жобаны таңдаңыз.</p>
          <dl v-else class="stat-pairs">
            <div><dt>{{ unitTitle }} саны</dt><dd>{{ formatCount(summary.unit.units) }}</dd></div>
            <div><dt>ARPU — бір {{ unitName }} табысы</dt><dd>{{ money(summary.unit.arpu) }}</dd></div>
            <div><dt>Бір {{ unitName }} үшін шығын</dt><dd>{{ money(summary.unit.costPerUnit) }}</dd></div>
            <div><dt>ФОТ бір {{ unitName }} үшін</dt><dd>{{ money(summary.unit.payrollPerUnit) }}</dd></div>
            <div><dt>Бір {{ unitName }} пайдасы</dt><dd :class="{ negative: (summary.unit.profitPerUnit ?? 0) < 0 }">{{ money(summary.unit.profitPerUnit) }}</dd></div>
            <div><dt>LTV / CAC</dt><dd>{{ summary.unit.ltvCac === null ? "—" : `${formatCount(summary.unit.ltvCac, 1)}×` }}</dd></div>
            <div><dt>Залалсыздық нүктесі</dt><dd>{{ summary.unit.breakEvenUnits === null ? "—" : `${formatCount(summary.unit.breakEvenUnits)} ${unitName}` }}</dd></div>
          </dl>
        </section>
      </div>

      <section class="panel analytics-panel ledger">
        <header><div><span class="eyebrow">Реестр</span><h2>Ақша қайда жұмсалды?</h2></div><button class="button secondary" type="button" @click="exportRows"><ArrowDownToLine :size="16" /> CSV</button></header>
        <div class="finance-tabs" role="group" aria-label="Жазба түрі">
          <button type="button" :class="{ active: view === 'actual' }" @click="view = 'actual'">Факт</button>
          <button type="button" :class="{ active: view === 'plan' }" @click="view = 'plan'">Жоспар</button>
          <button type="button" :class="{ active: view === 'review' }" @click="view = 'review'">Нақтылау керек ({{ reviewCount }})</button>
          <button type="button" :class="{ active: view === 'duplicates' }" @click="view = 'duplicates'">Есептен тыс ({{ summary.duplicates }})</button>
        </div>
        <div class="finance-filters">
          <input v-model="search" type="search" aria-label="Жазбаны іздеу" placeholder="Атауы, бөлімі немесе дереккөзі">
          <select v-model="category" aria-label="Категория"><option value="all">Барлық санат</option><option v-for="(label, key) in FINANCE_CATEGORIES" :key="key" :value="key">{{ label }}</option></select>
          <span>{{ rows.length }} жазба · {{ money(rows.reduce((a, r) => a + (r.amount ?? 0), 0)) }}</span>
        </div>
        <div v-if="!rows.length" class="finance-empty">Бұл сүзгі бойынша жазба жоқ.</div>
        <div class="finance-records">
          <article v-for="r in shownRows" :key="r.id" class="finance-record">
            <div>
              <small><template v-if="isAll">{{ finance.nameOf(r.workspaceId) }} · </template>{{ FINANCE_CATEGORIES[r.category] }} · {{ originLabels[r.origin] }}</small>
              <h3>{{ r.name }}</h3>
              <details v-if="r.note || r.source || (r.basis === 'actual' && isOperatingCost(r.category) && r.category !== 'marketing')">
                <summary>Толығырақ</summary>
                <p v-if="r.source">{{ r.source }}</p><p v-if="r.note">{{ r.note }}</p><p v-if="r.relatedId">Байланысты жазба: {{ r.relatedId }}</p>
                <label v-if="r.basis === 'actual' && isOperatingCost(r.category) && r.category !== 'marketing'" class="finance-rule">Юнит есебіндегі түрі
                  <select :value="r.costBehavior || 'fixed'" :aria-label="`${r.name}: шығын түрі`" @change="classify(r, $event)"><option value="fixed">Тұрақты шығын</option><option value="variable">Айнымалы (әр оқушыға)</option></select>
                </label>
              </details>
            </div>
            <div class="finance-record-money">
              <strong>{{ r.amount === null ? "Сома қажет" : money(r.amount) }}</strong>
              <small v-if="r.currency === 'USD' && r.currencyAmount">$ {{ formatCount(r.currencyAmount, 2) }} × {{ formatCount(r.fxRate, 2) }}</small>
              <small v-if="r.basis === 'actual'" :class="`finance-status-${r.status}`">{{ statusLabels[r.status] }}</small>
              <small v-else>Жоспар</small>
            </div>
            <button v-if="editable(r)" class="icon-button" type="button" :aria-label="`${r.name}: өзгерту`" @click="entryDraft = { ...r }"><Pencil :size="16" /></button>
            <button v-else class="finance-live-link" type="button" :disabled="payroll.loading.value" @click="openLive(r)">Payroll ↗</button>
          </article>
        </div>
        <footer v-if="pages > 1" class="finance-pagination"><button class="button secondary" type="button" :disabled="page <= 1" @click="page--">Алдыңғы</button><span>{{ page }} / {{ pages }}</span><button class="button secondary" type="button" :disabled="page >= pages" @click="page++">Келесі</button></footer>
      </section>
    </template>

    <FinanceEntryModal v-if="entryDraft" :entry="entryDraft" @close="entryDraft = null" @saved="entryDraft = null" />
  </div>
</template>
