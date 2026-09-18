<script setup lang="ts">
import { ArrowDownToLine, ArrowRight, CirclePlus, Pencil } from "lucide-vue-next";
import { FINANCE_CATEGORIES, FINANCE_KINDS, KIND_ORDER, entryKind, isOperatingCost, isOutstanding, type FinanceEntry, type FinanceKind } from "../../lib/finance";

const route = useRoute();
const payroll = usePayroll();
const finance = useFinance();
const ctx = useAppContext();
const { t } = useLocale();
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
const bankMonth = computed(() => finance.data.value?.bank ?? null);
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
  labels: trend.value.map(point => periodLabel(point.period, true)),
  details: trend.value.map(point => periodLabel(point.period)),
  // Built inside a computed, so the chart legend follows the language switch.
  series: KIND_ORDER.map(k => ({ key: k, label: t(FINANCE_KINDS[k]), color: KIND_COLORS[k], values: trend.value.map(point => point.hasData ? point.kinds[k] : null) })),
  line: trend.value.some(point => point.revenue !== null) ? { label: t("Табыс"), values: trend.value.map(point => point.revenue) } : null,
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
/**
 * The unit word sits inside these labels rather than being pasted into them, because Russian declines
 * it differently in every phrase. Each line is translated whole, in Kazakh exactly as before.
 */
const UNIT_LABELS = {
  client: { title: "Бір оқушы есебі", count: "Оқушы саны", arpu: "ARPU — бір оқушы табысы", cost: "Бір оқушы үшін шығын", payroll: "ФОТ бір оқушы үшін", profit: "Бір оқушы пайдасы" },
  order: { title: "Бір тапсырыс есебі", count: "Тапсырыс саны", arpu: "ARPU — бір тапсырыс табысы", cost: "Бір тапсырыс үшін шығын", payroll: "ФОТ бір тапсырыс үшін", profit: "Бір тапсырыс пайдасы" },
  service: { title: "Бір қызмет есебі", count: "Қызмет саны", arpu: "ARPU — бір қызмет табысы", cost: "Бір қызмет үшін шығын", payroll: "ФОТ бір қызмет үшін", profit: "Бір қызмет пайдасы" },
};
const unitLabels = computed(() => UNIT_LABELS[metrics.value.unitType]);

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
const originLabels = { salary: "Айлық", expense: "Payroll", legacy: "Ескі юнит-экономика", import: "Excel импорт", manual: "Қолмен", meta: "Meta кабинеті" };
const statusLabel = (e: FinanceEntry) => t(isOutstanding(e) ? "Төленбеген" : entryKind(e) === "salary" || entryKind(e) === "mandatory" ? "Төленді" : "Жұмсалды");
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
  const fields = ["Жоба", "Есептік ай", "Атауы", "Түрі", "Бөлім / топ", "Категория", "Сома, ₸", "USD", "Бағам", "Факт / жоспар", "Төлем", "Есепке қосылуы", "Дереккөз", "Ескерту"].map(field => t(field));
  // Neutralize spreadsheet formula injection in user-authored text.
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const csv = BOM + [fields, ...rows.value.map(e => [finance.nameOf(e.workspaceId), e.period, e.name, t(FINANCE_KINDS[entryKind(e)]), e.group ?? "", t(FINANCE_CATEGORIES[e.category]), e.amount ?? "", e.currencyAmount ?? "", e.fxRate ?? "", t(e.basis === "plan" ? "Жоспар" : "Факт"), statusLabel(e), e.disposition, e.source, e.note])]
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
    <nav class="project-tabs" :aria-label="t('Жобалар')">
      <button v-for="p in finance.projects.value" :key="p.id" type="button" :class="{ active: project === p.id }" :aria-pressed="project === p.id" :style="{ '--tab': finance.colorOf(p.id) }" @click="project = p.id"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</button>
    </nav>
    <p v-if="finance.error.value || actionError" class="finance-error" role="alert">{{ finance.error.value || actionError }}</p>
    <div v-if="!summary" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="kpi-row" :aria-label="t('Негізгі көрсеткіштер')" :class="{ stale: !finance.fresh.value }">
        <KpiTile tone="brand" :label="t('Айдың шығыны')" :value="money(summary.cost)" :sub="`${t('Жұмсалды')} ${compactMoney(summary.paid)}`" :delta="relativeChange(summary.cost, prevValue(p => p.cost))" />
        <KpiTile :tone="summary.obligations.unpaid > 0 ? 'danger' : 'success'" :label="t('Төленуі керек')" :value="money(summary.obligations.unpaid)" :sub="`${t('Айлық')} ${compactMoney(summary.kinds.salary.unpaid)} · ${t('міндетті')} ${compactMoney(summary.kinds.mandatory.unpaid)}`" />
        <KpiTile :label="t('Табыс')" :value="money(summary.revenue)" :sub="summary.revenueSource === 'bank' ? `${t('Выписка бойынша таза түсім · оборот')} ${compactMoney(summary.bank?.gross)}` : summary.revenue === null ? t('Выписка жүктеңіз немесе юнит бетінде енгізіңіз') : summary.unit.arpu !== null ? `${t('Қолмен енгізілген · ARPU')} ${money(summary.unit.arpu)}` : t('Қолмен енгізілген')" :delta="relativeChange(summary.revenue, prevValue(p => p.revenue))" good-when="up" />
        <KpiTile :label="t('Операциялық нәтиже')" :tone="summary.profit === null ? 'default' : summary.profit < 0 ? 'danger' : 'success'" :value="money(summary.profit)" :sub="summary.margin === null ? t('Табыс − операциялық шығын') : `${t('Маржа')} ${formatPercent(summary.margin)}`" :delta="relativeChange(summary.profit, prevValue(p => p.profit))" good-when="up" />
        <KpiTile :label="t('Таргет')" :value="money(summary.kinds.target.total)" :sub="summary.funnel.cpl !== null ? `CPL ${money(summary.funnel.cpl)} · CAC ${money(summary.funnel.cac)}` : t('Лид / клиент саны енгізілмеген')" :delta="relativeChange(summary.kinds.target.total, prevValue(p => p.kinds.target))" />
      </section>

      <section id="payments" class="bucket-grid" :aria-label="t('Төлем бақылауы')">
        <NuxtLink v-for="b in buckets" :key="b.kind" :to="b.to" class="panel bucket-card" :style="{ '--bucket': b.color }">
          <header><span><i />{{ t(b.label) }}</span><ArrowRight :size="15" /></header>
          <strong>{{ money(b.total) }}</strong>
          <template v-if="b.obligation">
            <span class="meter"><i :style="{ width: `${b.total ? b.paid / b.total * 100 : 0}%` }" /></span>
            <small v-if="b.unpaid" class="pp-owed">{{ t("Төленді") }} {{ compactMoney(b.paid) }} · {{ t("қалды") }} {{ money(b.unpaid) }}</small>
            <small v-else-if="b.total" class="pp-done">{{ t("Толық төленді") }}</small>
            <small v-else class="pp-none">{{ t("Бұл айда жазба жоқ") }}</small>
          </template>
          <small v-else class="pp-none">{{ b.count }} {{ t("жазба") }} · {{ t("жұмсалған ақша") }}</small>
          <ul v-if="b.list.length">
            <li v-for="e in b.list" :key="e.id"><span>{{ t(e.name) }}</span><b :class="{ owed: isOutstanding(e) }">{{ money(e.amount) }}</b></li>
          </ul>
          <small v-if="b.showingOwed" class="bucket-note">{{ t("Төленбегендер көрсетілді") }}</small>
        </NuxtLink>
      </section>

      <div class="analytics-columns">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("6 ай") }}</span><h2>{{ t("Ақша қайда кетті және табыс") }}</h2></div></header>
          <ChartColumns :caption="t('Шығын түрлері айлар бойынша')" :labels="chart.labels" :details="chart.details" :series="chart.series" :line="chart.line" :format="money" :axis-format="compactMoney" />
        </section>
        <section id="issues" class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("Бақылау") }}</span><h2>{{ t("Не істеу керек") }}</h2></div><NuxtLink :to="unitLink" class="text-button">{{ t("Деректерді енгізу") }} <ArrowRight :size="14" /></NuxtLink></header>
          <FinanceIssueList :items="issues" />
        </section>
      </div>

      <section id="pnl" class="panel analytics-panel">
        <header><div><span class="eyebrow">P&amp;L</span><h2>{{ t("Шығындар санаттар бойынша") }}</h2></div><small class="panel-note">{{ t("Салыстыру:") }} {{ periodLabel(shiftPeriod(period, -1)) }}</small></header>
        <div class="table-scroll">
          <table class="pnl-table detail">
            <thead><tr><th scope="col">{{ t("Санат") }}</th><th scope="col">{{ t("Осы ай") }}</th><th scope="col">{{ t("Үлесі") }}</th><th scope="col">{{ t("Өткен ай") }}</th><th scope="col">{{ t("Өзгеріс") }}</th><template v-if="hasPlan"><th scope="col">{{ t("Жоспар") }}</th><th scope="col">{{ t("Орындалуы") }}</th></template></tr></thead>
            <tbody>
              <tr class="subtotal"><th scope="row">{{ t("Табыс") }}</th><td><NuxtLink :to="unitLink" class="cell-link">{{ money(summary.revenue) }}</NuxtLink></td><td /><td>{{ money(prevValue(p => p.revenue)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr v-for="r in pnlRows" :key="r.key" :class="{ capital: r.group === 'capex' }">
                <th scope="row"><i class="group-dot" :style="{ background: GROUP_COLORS[r.group] }" />{{ t(r.name) }}</th>
                <td><NuxtLink v-if="r.amount" :to="ctx.financeLink(project, { category: r.key }, '#ledger')" class="cell-link">{{ money(r.amount) }}</NuxtLink><template v-else>{{ money(r.amount) }}</template></td>
                <td><span v-if="r.share !== null" class="share-bar"><i :style="{ width: `${r.share * 100}%` }" />{{ formatPercent(r.share, 0) }}</span></td>
                <td>{{ money(r.previous) }}</td>
                <td><span v-if="r.delta !== null" class="delta-chip" :class="Math.abs(r.delta) < 0.0005 ? 'flat' : r.delta > 0 ? 'bad' : 'good'">{{ r.delta > 0 ? "+" : "−" }}{{ formatDelta(r.delta) }}</span></td>
                <template v-if="hasPlan"><td>{{ money(r.plan) }}</td><td><span v-if="r.execution !== null" class="delta-chip" :class="r.execution > 1.05 ? 'bad' : 'flat'">{{ formatPercent(r.execution, 0) }}</span></td></template>
              </tr>
              <tr class="subtotal"><th scope="row">{{ t("Операциялық шығын") }}</th><td>{{ money(summary.operating) }}</td><td /><td>{{ money(prevValue(p => p.operating)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="result"><th scope="row">{{ t("Операциялық нәтиже") }}</th><td :class="{ negative: (summary.profit ?? 0) < 0 }">{{ money(summary.profit) }}</td><td>{{ formatPercent(summary.margin) }}</td><td>{{ money(prevValue(p => p.profit)) }}</td><td /><template v-if="hasPlan"><td /><td /></template></tr>
              <tr class="subtotal"><th scope="row">{{ t("Айдың шығыны, барлығы") }}</th><td>{{ money(summary.cost) }}</td><td /><td>{{ money(prevValue(p => p.cost)) }}</td><td /><template v-if="hasPlan"><td>{{ money(summary.plan) }}</td><td>{{ summary.plan ? formatPercent(summary.cost / summary.plan, 0) : "" }}</td></template></tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">{{ t("Жоспар — жеке бюджет, фактке қосылмайды. Жабдық пен депозит ақша шығынына кіреді, бірақ операциялық нәтижеге кірмейді.") }}</p>
      </section>

      <BankReceiptsPanel id="receipts" :bank="bankMonth?.byProject[project] ?? null" :categories="summary.categories" :project-id="project" :period="period" :pending="bankMonth?.pending ?? null" :covered-to="bankMonth?.coveredTo ?? null" :statements-exist="!!bankMonth" />

      <div class="insight-grid">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("Айлық · ФОТ") }}</span><h2>{{ t("Бөлімдер бойынша") }}</h2></div><NuxtLink :to="ctx.payrollLink('/departments', project)" class="text-button">{{ t("Айлық төлеміне") }} <ArrowRight :size="14" /></NuxtLink></header>
          <dl class="stat-pairs">
            <div><dt>{{ t("ФОТ барлығы") }}</dt><dd>{{ money(summary.payroll.total) }}</dd></div>
            <div><dt>{{ t("Адам саны") }}</dt><dd>{{ formatCount(summary.payroll.headcount) }}</dd></div>
            <div><dt>{{ t("Орташа айлық") }}</dt><dd>{{ money(summary.payroll.average) }}</dd></div>
            <div><dt>{{ t("Төленбеген") }}</dt><dd :class="{ warn: summary.payroll.unpaid > 0 }">{{ money(summary.payroll.unpaid) }}</dd></div>
            <div v-if="summary.payroll.advances"><dt>{{ t("Оның ішінде аванс (берілген)") }}</dt><dd>{{ money(summary.payroll.advances) }}</dd></div>
            <div v-if="summary.payrollShare !== null"><dt>{{ t("ФОТ / табыс") }}</dt><dd>{{ formatPercent(summary.payrollShare) }}</dd></div>
          </dl>
          <ul v-if="payrollRows.length" class="bar-list">
            <li v-for="r in payrollRows" :key="r.name">
              <div><span>{{ r.name }}</span><small>{{ r.headcount }} {{ t("адам") }}</small><b>{{ money(r.amount) }}</b></div>
              <span class="bar-track"><i :style="{ width: `${(r.amount / payrollMax) * 100}%`, background: KIND_COLORS.salary }" /></span>
              <small v-if="r.unpaid > 0" class="bar-note">{{ t("Төленбеген:") }} {{ money(r.unpaid) }}</small>
            </li>
          </ul>
          <p v-else class="panel-empty">{{ t("Бұл айда айлық жазбалары жоқ.") }}</p>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("Таргет") }}</span><h2>{{ t("Маркетинг воронкасы") }}</h2></div><button type="button" class="text-button" @click="finance.openEntry({ workspaceId: project, category: 'marketing', name: 'Таргет', currency: 'USD' })"><CirclePlus :size="14" /> {{ t("Таргет қосу") }}</button></header>
          <div class="funnel">
            <div><small>{{ t("Шығын") }}</small><strong>{{ money(summary.funnel.spend) }}</strong><em v-if="summary.funnel.spendUsd">$ {{ formatCount(summary.funnel.spendUsd, 2) }}</em></div>
            <div><small>{{ t("Лидтер") }}</small><strong>{{ formatCount(summary.funnel.leads) }}</strong><em>CPL {{ money(summary.funnel.cpl) }}</em></div>
            <div><small>{{ t("Жаңа клиенттер") }}</small><strong>{{ formatCount(summary.funnel.customers) }}</strong><em>{{ t("Конверсия") }} {{ formatPercent(summary.funnel.conversion) }}</em></div>
          </div>
          <dl class="stat-pairs">
            <div><dt>{{ t("CAC — клиент тарту құны") }}</dt><dd>{{ money(summary.funnel.cac) }}</dd></div>
            <div><dt>{{ t("Маркетинг / табыс") }}</dt><dd>{{ formatPercent(summary.marketingShare) }}</dd></div>
            <div><dt>ROMI {{ summary.unit.romiBasis === "ltv" ? t("(LTV бойынша)") : t("(1 ай)") }}</dt><dd>{{ formatPercent(summary.unit.romi, 0) }}</dd></div>
          </dl>
          <NuxtLink :to="unitLink" class="text-button">{{ t("Лид пен клиент санын енгізу") }} <ArrowRight :size="14" /></NuxtLink>
        </section>

        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">{{ t("Юнит-экономика") }}</span><h2>{{ t(unitLabels.title) }}</h2></div><NuxtLink :to="unitLink" class="text-button">{{ t("Толығырақ") }} <ArrowRight :size="14" /></NuxtLink></header>
          <dl class="stat-pairs">
            <div><dt>{{ t(unitLabels.count) }}</dt><dd>{{ formatCount(summary.unit.units) }}</dd></div>
            <div><dt>{{ t(unitLabels.arpu) }}</dt><dd>{{ money(summary.unit.arpu) }}</dd></div>
            <div><dt>{{ t(unitLabels.cost) }}</dt><dd>{{ money(summary.unit.costPerUnit) }}</dd></div>
            <div><dt>{{ t(unitLabels.payroll) }}</dt><dd>{{ money(summary.unit.payrollPerUnit) }}</dd></div>
            <div><dt>{{ t(unitLabels.profit) }}</dt><dd :class="{ negative: (summary.unit.profitPerUnit ?? 0) < 0 }">{{ money(summary.unit.profitPerUnit) }}</dd></div>
            <div><dt>LTV / CAC</dt><dd>{{ summary.unit.ltvCac === null ? "—" : `${formatCount(summary.unit.ltvCac, 1)}×` }}</dd></div>
            <div><dt>{{ t("Залалсыздық нүктесі") }}</dt><dd>{{ summary.unit.breakEvenUnits === null ? "—" : `${formatCount(summary.unit.breakEvenUnits)} ${t(unitName)}` }}</dd></div>
          </dl>
        </section>
      </div>

      <section id="ledger" class="panel analytics-panel ledger">
        <header><div><span class="eyebrow">{{ t("Реестр") }}</span><h2>{{ t("Барлық жазба") }}</h2></div><div class="ledger-actions"><button class="button secondary" type="button" @click="finance.openEntry({ workspaceId: project })"><CirclePlus :size="16" /> {{ t("Жазба") }}</button><button class="button secondary" type="button" @click="exportRows"><ArrowDownToLine :size="16" /> CSV</button></div></header>
        <div class="finance-tabs" role="group" :aria-label="t('Шығын түрі')">
          <button type="button" :class="{ active: kindFilter === 'all' }" @click="kindFilter = 'all'">{{ t("Барлығы") }} ({{ kindCount("all") }})</button>
          <button v-for="k in KIND_ORDER" :key="k" type="button" :class="{ active: kindFilter === k }" @click="kindFilter = k"><i class="group-dot" :style="{ background: KIND_COLORS[k] }" />{{ t(FINANCE_KINDS[k]) }} ({{ kindCount(k) }})</button>
        </div>
        <div class="finance-filters">
          <input v-model="search" type="search" :aria-label="t('Жазбаны іздеу')" :placeholder="t('Атауы, бөлімі немесе дереккөзі')">
          <select v-model="category" :aria-label="t('Санат')"><option value="all">{{ t("Барлық санат") }}</option><option v-for="(label, key) in FINANCE_CATEGORIES" :key="key" :value="key">{{ t(label) }}</option></select>
          <select v-model="view" :aria-label="t('Жазба күйі')"><option value="actual">{{ t("Факт") }}</option><option value="plan">{{ t("Жоспар") }}</option><option value="review">{{ t("Нақтылау керек") }} ({{ reviewCount }})</option><option value="duplicates">{{ t("Есептен тыс") }} ({{ summary.duplicates }})</option></select>
          <label class="finance-check owed-toggle"><input v-model="onlyOwed" type="checkbox"> {{ t("Тек төленбегендер") }}</label>
          <span>{{ rows.length }} {{ t("жазба") }} · {{ money(rows.reduce((a, r) => a + (r.amount ?? 0), 0)) }}</span>
        </div>
        <div v-if="!rows.length" class="finance-empty">{{ t("Бұл сүзгі бойынша жазба жоқ.") }}</div>
        <div class="finance-records">
          <article v-for="r in shownRows" :key="r.id" class="finance-record">
            <div>
              <small><i class="group-dot" :style="{ background: KIND_COLORS[entryKind(r)] }" />{{ t(FINANCE_KINDS[entryKind(r)]) }} · {{ t(FINANCE_CATEGORIES[r.category]) }} · {{ t(originLabels[r.origin]) }}</small>
              <h3>{{ t(r.name) }}</h3>
              <details v-if="r.note || r.source || (r.basis === 'actual' && isOperatingCost(r.category) && r.category !== 'marketing')">
                <summary>{{ t("Толығырақ") }}</summary>
                <p v-if="r.source">{{ r.source }}</p><p v-if="r.note">{{ r.note }}</p><p v-if="r.relatedId">{{ t("Байланысты жазба:") }} {{ r.relatedId }}</p>
                <label v-if="r.basis === 'actual' && isOperatingCost(r.category) && r.category !== 'marketing'" class="finance-rule">{{ t("Юнит есебіндегі түрі") }}
                  <select :value="r.costBehavior || 'fixed'" :aria-label="`${r.name}: ${t('шығын түрі')}`" @change="classify(r, $event)"><option value="fixed">{{ t("Тұрақты шығын") }}</option><option value="variable">{{ t("Айнымалы (әр оқушыға)") }}</option></select>
                </label>
              </details>
            </div>
            <div class="finance-record-money">
              <strong>{{ r.amount === null ? t("Сома қажет") : money(r.amount) }}</strong>
              <small v-if="r.currency === 'USD' && r.currencyAmount">$ {{ formatCount(r.currencyAmount, 2) }} × {{ formatCount(r.fxRate, 2) }}</small>
              <small v-if="r.basis === 'actual'" :class="isOutstanding(r) ? 'finance-status-unpaid' : 'finance-status-paid'">{{ statusLabel(r) }}</small>
              <small v-else>{{ t("Жоспар") }}</small>
            </div>
            <button v-if="editable(r)" class="icon-button" type="button" :aria-label="`${r.name}: ${t('өзгерту')}`" @click="finance.entryDraft.value = { ...r }"><Pencil :size="16" /></button>
            <NuxtLink v-else :to="livePath(r)" class="finance-live-link" :class="{ disabled: payroll.loading.value }">{{ t("Ашу ↗") }}</NuxtLink>
          </article>
        </div>
        <footer v-if="pages > 1" class="finance-pagination"><button class="button secondary" type="button" :disabled="page <= 1" @click="page--">{{ t("Алдыңғы") }}</button><span>{{ page }} / {{ pages }}</span><button class="button secondary" type="button" :disabled="page >= pages" @click="page++">{{ t("Келесі") }}</button></footer>
      </section>
    </template>
  </div>
</template>
