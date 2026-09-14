<script setup lang="ts">
import { ArrowDownToLine, ArrowRight, CirclePlus, Pencil } from "lucide-vue-next";
import { FINANCE_CATEGORIES, FINANCE_KINDS, KIND_ORDER, entryKind, isOperatingCost, isOutstanding, type FinanceEntry, type FinanceKind } from "../../lib/finance";

const route = useRoute();
const payroll = usePayroll();
const finance = useFinance();
const ctx = useAppContext();
const { period } = finance;
onMounted(finance.load);

// The report has its own project tabs; they never change the payroll profile.
const project = ref(typeof route.query.project === "string" ? route.query.project : "");
watch(finance.projects, list => {
  if (list.length && !list.some(p => p.id === project.value)) project.value = list[0]!.id;
}, { immediate: true });
watch(project, id => {
  finance.reportProject.value = id;
  if (id && route.query.project !== id) navigateTo({ query: { ...route.query, project: id }, hash: route.hash }, { replace: true });
}, { immediate: true });
watch(() => route.query.project, id => { if (typeof id === "string" && id && id !== project.value) project.value = id; });
const summary = computed(() => finance.summaries.value[project.value] ?? null);
const metrics = computed(() => finance.metricsOf(project.value));
const trend = computed(() => finance.trendOf(project.value));
const previous = computed(() => trend.value.length > 1 ? trend.value[trend.value.length - 2]! : null);
const prevValue = <T,>(pick: (p: NonNullable<typeof previous.value>) => T) => previous.value?.hasData ? pick(previous.value) : null;
const entries = computed(() => finance.entriesOf(project.value).filter(e => e.disposition === "included" && e.basis === "actual" && e.amount !== null));

// Jump to #ledger, #pnl, #payments or #issues once the report has rendered.
watch([summary, () => route.hash, () => route.query], ([value]) => {
  if (value && route.hash) nextTick(() => document.getElementById(route.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }));
}, { immediate: true });

const chart = computed(() => ({
  labels: trend.value.map(t => periodLabel(t.period, true)),
  details: trend.value.map(t => periodLabel(t.period)),
  series: KIND_ORDER.map(k => ({ key: k, label: FINANCE_KINDS[k], color: KIND_COLORS[k], values: trend.value.map(t => t.hasData ? t.kinds[k] : null) })),
  line: trend.value.some(t => t.revenue !== null) ? { label: "Табыс", values: trend.value.map(t => t.revenue) } : null,
}));

/** The four ways money left this project this month, each with what is still owed. */
const buckets = computed(() => KIND_ORDER.map(kind => {
  const rows = entries.value.filter(e => entryKind(e) === kind).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const owed = rows.filter(isOutstanding);
  const k = summary.value!.kinds[kind];
  const to = kind === "salary" ? ctx.payrollLink("/departments", project.value, "#payment-queue")
    : kind === "mandatory" ? ctx.payrollLink("/expenses", project.value)
    : ctx.financeLink(project.value, { kind }, "#ledger");
  return { kind, label: FINANCE_KINDS[kind], color: KIND_COLORS[kind], ...k, obligation: kind === "salary" || kind === "mandatory", list: (owed.length ? owed : rows).slice(0, 4), showingOwed: owed.length > 0, to };
}));

const issues = computed(() => (finance.issues.value[project.value] ?? []).map(issue => ({ issue, to: ctx.issueLink(issue.code, project.value) })));

const pnlRows = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return s.categories.map(c => {
    const prev = prevValue(p => p.categories[c.key] ?? 0);
    return { ...c, previous: prev, delta: relativeChange(c.amount, prev), share: s.cost > 0 && c.amount ? c.amount / s.cost : null, execution: c.plan ? (c.amount ?? 0) / c.plan : null };
  });
});
const hasPlan = computed(() => pnlRows.value.some(r => r.plan !== null));
const payrollRows = computed(() => summary.value?.payroll.departments.filter(d => d.amount > 0) ?? []);
const payrollMax = computed(() => Math.max(1, ...payrollRows.value.map(r => r.amount)));
const unitName = computed(() => ({ client: "оқушы", order: "тапсырыс", service: "қызмет" })[metrics.value.unitType]);
const unitTitle = computed(() => unitName.value.charAt(0).toLocaleUpperCase("kk-KZ") + unitName.value.slice(1));

// Ledger, filterable from links: ?kind=&category=&view=&status=
const q = (key: string) => typeof route.query[key] === "string" ? route.query[key] as string : "";
const kindFilter = ref<"all" | FinanceKind>((KIND_ORDER as string[]).includes(q("kind")) ? q("kind") as FinanceKind : "all");
const view = ref<"actual" | "plan" | "review" | "duplicates">((["plan", "review", "duplicates"] as const).find(v => v === q("view")) ?? "actual");
const category = ref(Object.hasOwn(FINANCE_CATEGORIES, q("category")) ? q("category") : "all");
const onlyOwed = ref(q("status") === "unpaid");
const search = ref(""), page = ref(1), actionError = ref("");
watch(() => route.query, query => {
  if (typeof query.kind === "string" && (KIND_ORDER as string[]).includes(query.kind)) kindFilter.value = query.kind as FinanceKind;
  if (typeof query.category === "string" && Object.hasOwn(FINANCE_CATEGORIES, query.category)) category.value = query.category;
  if (typeof query.view === "string") view.value = (["plan", "review", "duplicates"] as const).find(v => v === query.view) ?? "actual";
  onlyOwed.value = query.status === "unpaid";
});
const viewEntries = computed(() => finance.entriesOf(project.value));
const reviewCount = computed(() => viewEntries.value.filter(e => e.disposition === "review" || (e.disposition === "included" && e.amount === null)).length);
const rows = computed(() => viewEntries.value.filter(e =>
  (view.value === "review" ? e.disposition === "review" || (e.disposition === "included" && e.amount === null)
    : view.value === "duplicates" ? e.disposition === "duplicate" : e.disposition === "included" && e.basis === view.value)
  && (kindFilter.value === "all" || entryKind(e) === kindFilter.value)
  && (category.value === "all" || e.category === category.value)
  && (!onlyOwed.value || isOutstanding(e))
  && `${e.name} ${e.note} ${e.source} ${e.group ?? ""}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)));
const shownRows = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25));
watch([project, view, category, search, period, kindFilter, onlyOwed], () => { page.value = 1; });
const kindCount = (kind: "all" | FinanceKind) => viewEntries.value.filter(e => e.disposition === "included" && e.basis === "actual" && (kind === "all" || entryKind(e) === kind)).length;
const originLabels = { salary: "Айлық", expense: "Payroll", legacy: "Ескі юнит-экономика", import: "Excel импорт", manual: "Қолмен" };
const statusLabel = (e: FinanceEntry) => isOutstanding(e) ? "Төленбеген" : entryKind(e) === "salary" || entryKind(e) === "mandatory" ? "Төленді" : "Жұмсалды";
const editable = (e: FinanceEntry) => e.origin === "import" || e.origin === "manual";
function livePath(r: FinanceEntry) {
  if (r.origin === "salary") return ctx.payrollLink("/departments", r.workspaceId);
  if (r.origin === "legacy") return unitLink.value;
  return ctx.payrollLink("/expenses", r.workspaceId, "", r.oneTime ? { tab: "other" } : {});
}
const unitLink = computed(() => `/unit-economics?month=${period.value}#metrics-${project.value}`);
async function classify(r: FinanceEntry, event: Event) {
  const target = event.target as HTMLSelectElement;
  actionError.value = await finance.classify(r, target.value);
  if (actionError.value) target.value = r.costBehavior || "fixed";
}
function exportRows() {
  const fields = ["Жоба", "Есептік ай", "Атауы", "Түрі", "Бөлім / топ", "Категория", "Сома, ₸", "USD", "Бағам", "Факт / жоспар", "Төлем", "Есепке қосылуы", "Дереккөз", "Ескерту"];
  // Neutralize spreadsheet formula injection in user-authored text.
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const csv = BOM + [fields, ...rows.value.map(e => [finance.nameOf(e.workspaceId), e.period, e.name, FINANCE_KINDS[entryKind(e)], e.group ?? "", FINANCE_CATEGORIES[e.category], e.amount ?? "", e.currencyAmount ?? "", e.fxRate ?? "", e.basis === "plan" ? "Жоспар" : "Факт", statusLabel(e), e.disposition, e.source, e.note])]
    .map(r => r.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-${finance.nameOf(project.value)}-${period.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
const BOM = String.fromCharCode(0xfeff);
</script>

<template>
  <div class="analytics-page" :style="{ '--project': finance.colorOf(project) }">
    <AnalyticsHeader />
    <nav class="project-tabs" aria-label="Жобалар">
      <button v-for="p in finance.projects.value" :key="p.id" type="button" :class="{ active: project === p.id }" :aria-pressed="project === p.id" :style="{ '--tab': finance.colorOf(p.id) }" @click="project = p.id"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</button>
    </nav>
    <p v-if="finance.error.value || actionError" class="finance-error" role="alert">{{ finance.error.value || actionError }}</p>
    <div v-if="!summary" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="kpi-row" aria-label="Негізгі көрсеткіштер" :class="{ stale: !finance.fresh.value }">
        <KpiTile tone="brand" label="Айдың шығыны" :value="money(summary.cost)" :sub="`Жұмсалды ${compactMoney(summary.paid)}`" :delta="relativeChange(summary.cost, prevValue(p => p.cost))" />
        <KpiTile :tone="summary.obligations.unpaid > 0 ? 'danger' : 'success'" label="Төленуі керек" :value="money(summary.obligations.unpaid)" :sub="`Айлық ${compactMoney(summary.kinds.salary.unpaid)} · міндетті ${compactMoney(summary.kinds.mandatory.unpaid)}`" />
        <KpiTile label="Табыс" :value="money(summary.revenue)" :sub="summary.revenue === null ? 'Юнит бетінде енгізіңіз' : summary.unit.arpu !== null ? `ARPU ${money(summary.unit.arpu)}` : 'Танылған табыс'" :delta="relativeChange(summary.revenue, prevValue(p => p.revenue))" good-when="up" />
        <KpiTile label="Операциялық нәтиже" :tone="summary.profit === null ? 'default' : summary.profit < 0 ? 'danger' : 'success'" :value="money(summary.profit)" :sub="summary.margin === null ? 'Табыс − операциялық шығын' : `Маржа ${formatPercent(summary.margin)}`" :delta="relativeChange(summary.profit, prevValue(p => p.profit))" good-when="up" />
        <KpiTile label="Таргет" :value="money(summary.kinds.target.total)" :sub="summary.funnel.cpl !== null ? `CPL ${money(summary.funnel.cpl)} · CAC ${money(summary.funnel.cac)}` : 'Лид / клиент саны енгізілмеген'" :delta="relativeChange(summary.kinds.target.total, prevValue(p => p.kinds.target))" />
      </section>

      <section id="payments" class="bucket-grid" aria-label="Төлем бақылауы">
        <NuxtLink v-for="b in buckets" :key="b.kind" :to="b.to" class="panel bucket-card" :style="{ '--bucket': b.color }">
          <header><span><i />{{ b.label }}</span><ArrowRight :size="15" /></header>
          <strong>{{ money(b.total) }}</strong>
          <template v-if="b.obligation">
            <span class="meter"><i :style="{ width: `${b.total ? b.paid / b.total * 100 : 0}%` }" /></span>
            <small v-if="b.unpaid" class="pp-owed">Төленді {{ compactMoney(b.paid) }} · қалды {{ money(b.unpaid) }}</small>
            <small v-else-if="b.total" class="pp-done">Толық төленді</small>
            <small v-else class="pp-none">Бұл айда жазба жоқ</small>
          </template>
          <small v-else class="pp-none">{{ b.count }} жазба · жұмсалған ақша</small>
          <ul v-if="b.list.length">
            <li v-for="e in b.list" :key="e.id"><span>{{ e.name }}</span><b :class="{ owed: isOutstanding(e) }">{{ money(e.amount) }}</b></li>
          </ul>
          <small v-if="b.showingOwed" class="bucket-note">Төленбегендер көрсетілді</small>
        </NuxtLink>
      </section>

      <div class="analytics-columns">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">6 ай</span><h2>Ақша қайда кетті және табыс</h2></div></header>
          <ChartColumns caption="Шығын түрлері айлар бойынша" :labels="chart.labels" :details="chart.details" :series="chart.series" :line="chart.line" :format="money" :axis-format="compactMoney" />
        </section>
        <section id="issues" class="panel analytics-panel">
          <header><div><span class="eyebrow">Бақылау</span><h2>Не істеу керек</h2></div><NuxtLink :to="unitLink" class="text-button">Деректерді енгізу <ArrowRight :size="14" /></NuxtLink></header>
          <FinanceIssueList :items="issues" />
        </section>
      </div>

      <section id="pnl" class="panel analytics-panel">
        <header><div><span class="eyebrow">P&amp;L</span><h2>Шығындар санаттар бойынша</h2></div><small class="panel-note">Салыстыру: {{ periodLabel(shiftPeriod(period, -1)) }}</small></header>
        <div class="table-scroll">
          <table class="pnl-table detail">
            <thead><tr><th scope="col">Санат</th><th scope="col">Осы ай</th><th scope="col">Үлесі</th><th scope="col">Өткен ай</th><th scope="col">Өзгеріс</th><template v-if="hasPlan"><th scope="col">Жоспар</th><th scope="col">Орындалуы</th></template></tr></thead>
            <tbody>
              <tr class="subtotal"><th scope="row">Табыс</th><td><NuxtLink :to="unitLink" class="cell-link">{{ money(summary.revenue) }}</NuxtLink></td><td /><td>{{ money(prevValue(p => p.revenue)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr v-for="r in pnlRows" :key="r.key" :class="{ capital: r.group === 'capex' }">
                <th scope="row"><i class="group-dot" :style="{ background: GROUP_COLORS[r.group] }" />{{ r.name }}</th>
                <td><NuxtLink v-if="r.amount" :to="ctx.financeLink(project, { category: r.key }, '#ledger')" class="cell-link">{{ money(r.amount) }}</NuxtLink><template v-else>{{ money(r.amount) }}</template></td>
                <td><span v-if="r.share !== null" class="share-bar"><i :style="{ width: `${r.share * 100}%` }" />{{ formatPercent(r.share, 0) }}</span></td>
                <td>{{ money(r.previous) }}</td>
                <td><span v-if="r.delta !== null" class="delta-chip" :class="Math.abs(r.delta) < 0.0005 ? 'flat' : r.delta > 0 ? 'bad' : 'good'">{{ r.delta > 0 ? "+" : "−" }}{{ formatDelta(r.delta) }}</span></td>
                <template v-if="hasPlan"><td>{{ money(r.plan) }}</td><td><span v-if="r.execution !== null" class="delta-chip" :class="r.execution > 1.05 ? 'bad' : 'flat'">{{ formatPercent(r.execution, 0) }}</span></td></template>
              </tr>
              <tr class="subtotal"><th scope="row">Операциялық шығын</th><td>{{ money(summary.operating) }}</td><td /><td>{{ money(prevValue(p => p.operating)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="result"><th scope="row">Операциялық нәтиже</th><td :class="{ negative: (summary.profit ?? 0) < 0 }">{{ money(summary.profit) }}</td><td>{{ formatPercent(summary.margin) }}</td><td>{{ money(prevValue(p => p.profit)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="subtotal"><th scope="row">Айдың шығыны, барлығы</th><td>{{ money(summary.cost) }}</td><td /><td>{{ money(prevValue(p => p.cost)) }}</td><td /><template v-if="hasPlan"><td>{{ money(summary.plan) }}</td><td>{{ summary.plan ? formatPercent(summary.cost / summary.plan, 0) : "" }}</td></template></tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">Жоспар — жеке бюджет, фактке қосылмайды. Жабдық пен депозит ақша шығынына кіреді, бірақ операциялық нәтижеге кірмейді.</p>
      </section>

      <div class="insight-grid">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Айлық · ФОТ</span><h2>Бөлімдер бойынша</h2></div><NuxtLink :to="ctx.payrollLink('/departments', project)" class="text-button">Айлық төлеміне <ArrowRight :size="14" /></NuxtLink></header>
          <dl class="stat-pairs">
            <div><dt>ФОТ барлығы</dt><dd>{{ money(summary.payroll.total) }}</dd></div>
            <div><dt>Адам саны</dt><dd>{{ formatCount(summary.payroll.headcount) }}</dd></div>
            <div><dt>Орташа айлық</dt><dd>{{ money(summary.payroll.average) }}</dd></div>
            <div><dt>Төленбеген</dt><dd :class="{ warn: summary.payroll.unpaid > 0 }">{{ money(summary.payroll.unpaid) }}</dd></div>
            <div v-if="summary.payroll.advances"><dt>Оның ішінде аванс (берілген)</dt><dd>{{ money(summary.payroll.advances) }}</dd></div>
            <div v-if="summary.payrollShare !== null"><dt>ФОТ / табыс</dt><dd>{{ formatPercent(summary.payrollShare) }}</dd></div>
          </dl>
          <ul v-if="payrollRows.length" class="bar-list">
            <li v-for="r in payrollRows" :key="r.name">
              <div><span>{{ r.name }}</span><small>{{ r.headcount }} адам</small><b>{{ money(r.amount) }}</b></div>
              <span class="bar-track"><i :style="{ width: `${(r.amount / payrollMax) * 100}%`, background: KIND_COLORS.salary }" /></span>
              <small v-if="r.unpaid > 0" class="bar-note">Төленбеген: {{ money(r.unpaid) }}</small>
            </li>
          </ul>
          <p v-else class="panel-empty">Бұл айда айлық жазбалары жоқ.</p>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Таргет</span><h2>Маркетинг воронкасы</h2></div><button type="button" class="text-button" @click="finance.openEntry({ workspaceId: project, category: 'marketing', name: 'Таргет', currency: 'USD' })"><CirclePlus :size="14" /> Таргет қосу</button></header>
          <div class="funnel">
            <div><small>Шығын</small><strong>{{ money(summary.funnel.spend) }}</strong><em v-if="summary.funnel.spendUsd">$ {{ formatCount(summary.funnel.spendUsd, 2) }}</em></div>
            <div><small>Лидтер</small><strong>{{ formatCount(summary.funnel.leads) }}</strong><em>CPL {{ money(summary.funnel.cpl) }}</em></div>
            <div><small>Жаңа клиенттер</small><strong>{{ formatCount(summary.funnel.customers) }}</strong><em>Конверсия {{ formatPercent(summary.funnel.conversion) }}</em></div>
          </div>
          <dl class="stat-pairs">
            <div><dt>CAC — клиент тарту құны</dt><dd>{{ money(summary.funnel.cac) }}</dd></div>
            <div><dt>Маркетинг / табыс</dt><dd>{{ formatPercent(summary.marketingShare) }}</dd></div>
            <div><dt>ROMI {{ summary.unit.romiBasis === "ltv" ? "(LTV бойынша)" : "(1 ай)" }}</dt><dd>{{ formatPercent(summary.unit.romi, 0) }}</dd></div>
          </dl>
          <NuxtLink :to="unitLink" class="text-button">Лид пен клиент санын енгізу <ArrowRight :size="14" /></NuxtLink>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Юнит-экономика</span><h2>Бір {{ unitName }} есебі</h2></div><NuxtLink :to="unitLink" class="text-button">Толығырақ <ArrowRight :size="14" /></NuxtLink></header>
          <dl class="stat-pairs">
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

      <section id="ledger" class="panel analytics-panel ledger">
        <header><div><span class="eyebrow">Реестр</span><h2>Барлық жазба</h2></div><div class="ledger-actions"><button class="button secondary" type="button" @click="finance.openEntry({ workspaceId: project })"><CirclePlus :size="16" /> Жазба</button><button class="button secondary" type="button" @click="exportRows"><ArrowDownToLine :size="16" /> CSV</button></div></header>
        <div class="finance-tabs" role="group" aria-label="Шығын түрі">
          <button type="button" :class="{ active: kindFilter === 'all' }" @click="kindFilter = 'all'">Барлығы ({{ kindCount("all") }})</button>
          <button v-for="k in KIND_ORDER" :key="k" type="button" :class="{ active: kindFilter === k }" @click="kindFilter = k"><i class="group-dot" :style="{ background: KIND_COLORS[k] }" />{{ FINANCE_KINDS[k] }} ({{ kindCount(k) }})</button>
        </div>
        <div class="finance-filters">
          <input v-model="search" type="search" aria-label="Жазбаны іздеу" placeholder="Атауы, бөлімі немесе дереккөзі">
          <select v-model="category" aria-label="Санат"><option value="all">Барлық санат</option><option v-for="(label, key) in FINANCE_CATEGORIES" :key="key" :value="key">{{ label }}</option></select>
          <select v-model="view" aria-label="Жазба күйі"><option value="actual">Факт</option><option value="plan">Жоспар</option><option value="review">Нақтылау керек ({{ reviewCount }})</option><option value="duplicates">Есептен тыс ({{ summary.duplicates }})</option></select>
          <label class="finance-check owed-toggle"><input v-model="onlyOwed" type="checkbox"> Тек төленбегендер</label>
          <span>{{ rows.length }} жазба · {{ money(rows.reduce((a, r) => a + (r.amount ?? 0), 0)) }}</span>
        </div>
        <div v-if="!rows.length" class="finance-empty">Бұл сүзгі бойынша жазба жоқ.</div>
        <div class="finance-records">
          <article v-for="r in shownRows" :key="r.id" class="finance-record">
            <div>
              <small><i class="group-dot" :style="{ background: KIND_COLORS[entryKind(r)] }" />{{ FINANCE_KINDS[entryKind(r)] }} · {{ FINANCE_CATEGORIES[r.category] }} · {{ originLabels[r.origin] }}</small>
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
              <small v-if="r.basis === 'actual'" :class="isOutstanding(r) ? 'finance-status-unpaid' : 'finance-status-paid'">{{ statusLabel(r) }}</small>
              <small v-else>Жоспар</small>
            </div>
            <button v-if="editable(r)" class="icon-button" type="button" :aria-label="`${r.name}: өзгерту`" @click="finance.entryDraft.value = { ...r }"><Pencil :size="16" /></button>
            <NuxtLink v-else :to="livePath(r)" class="finance-live-link" :class="{ disabled: payroll.loading.value }">Ашу ↗</NuxtLink>
          </article>
        </div>
        <footer v-if="pages > 1" class="finance-pagination"><button class="button secondary" type="button" :disabled="page <= 1" @click="page--">Алдыңғы</button><span>{{ page }} / {{ pages }}</span><button class="button secondary" type="button" :disabled="page >= pages" @click="page++">Келесі</button></footer>
      </section>
    </template>
  </div>
</template>
