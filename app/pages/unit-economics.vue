<script setup lang="ts">
import { CirclePlus, Save } from "lucide-vue-next";
import { EMPTY_FINANCE_METRICS, type FinanceMetrics, type FinanceSummary } from "../../lib/finance";

const route = useRoute();
const finance = useFinance();
const { projects, summaries, total, period } = finance;
onMounted(finance.load);

// A link like #metrics-<project> highlights and opens that project's form.
const focus = computed(() => route.hash.startsWith("#metrics-") ? route.hash.slice("#metrics-".length) : "");
const drafts = reactive<Record<string, FinanceMetrics>>({});
const saving = reactive<Record<string, boolean>>({});
const messages = reactive<Record<string, { ok: boolean; text: string } | undefined>>({});

// Fresh data replaces a form only when the month changed or the form has no unsaved edits,
// so saving one project never discards what was typed in another.
const baselines: Record<string, string> = {};
let loadedPeriod = "";
watch(() => finance.data.value, data => {
  if (!data) return;
  const monthChanged = data.period !== loadedPeriod;
  loadedPeriod = data.period;
  for (const p of data.projects) {
    const next = { ...EMPTY_FINANCE_METRICS, ...data.metrics[p.id] };
    if (monthChanged || !drafts[p.id] || JSON.stringify(drafts[p.id]) === baselines[p.id]) {
      drafts[p.id] = next;
      if (monthChanged) messages[p.id] = undefined;
    }
    baselines[p.id] = JSON.stringify(next);
  }
}, { immediate: true });
// A link like #metrics-<project> opens the form of that project.
watch(() => finance.data.value, data => {
  if (data && route.hash.startsWith("#metrics-")) nextTick(() => document.getElementById(route.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }));
}, { immediate: true });

const fields: Array<{ key: keyof FinanceMetrics; label: string; hint: string; money?: boolean; step?: string }> = [
  { key: "revenue", label: "Табыс, ₸", hint: "Осы айда танылған (есептелген) табыс", money: true },
  { key: "receipts", label: "Түскен ақша, ₸", hint: "Шотқа нақты түскен сома", money: true },
  { key: "units", label: "Оқушы / клиент саны", hint: "Осы айда белсенді, ақы төлейтін", step: "1" },
  { key: "leads", label: "Лидтер", hint: "Таргет пен басқа арналардан", step: "1" },
  { key: "customers", label: "Жаңа ақылы клиенттер", hint: "Осы айда алғаш төлегендер", step: "1" },
  { key: "retentionMonths", label: "Клиент орташа неше ай оқиды", hint: "LTV үшін, мысалы 6", step: "0.1" },
];
const dirty = (id: string) => JSON.stringify(drafts[id]) !== JSON.stringify({ ...EMPTY_FINANCE_METRICS, ...finance.metricsOf(id) });
const previousOf = (id: string) => finance.previousOf(id);

async function save(id: string) {
  const draft = drafts[id];
  if (!draft) return;
  saving[id] = true;
  // Inputs bound to number fields return "" when cleared; the server treats empty as "not reported".
  const error = await finance.saveMetrics(id, { ...draft });
  saving[id] = false;
  if (!error) drafts[id] = { ...EMPTY_FINANCE_METRICS, ...finance.metricsOf(id) };
  messages[id] = error ? { ok: false, text: error } : { ok: true, text: "Сақталды — барлық есеп жаңартылды." };
}
function addTarget(workspaceId: string) {
  finance.openEntry({ workspaceId, name: "Таргет", category: "marketing", source: "Жарнама кабинеті", currency: "USD" });
}

type Row = { label: string; hint?: string; value: (s: FinanceSummary, id: string | null) => string; note?: (s: FinanceSummary) => string; tone?: (s: FinanceSummary) => string };
const sourceNote = (s: FinanceSummary) => s.revenueSource === "bank" ? "выписка бойынша" : s.revenueSource === "manual" ? "қолмен енгізілген" : s.revenueSource === "ledger" ? "реестрден" : "";
const share = (part: number | undefined, whole: number | undefined) => part !== undefined && whole ? formatPercent(part / whole) : "—";
const unitLabel = (id: string) => ({ client: "оқушы", order: "тапсырыс", service: "қызмет" })[finance.metricsOf(id).unitType];
const unitRows: Row[] = [
  { label: "Валовой оборот", hint: "Выписка: Kaspi сатылымдары + Halyk карта есептері", value: s => money(s.bank?.gross ?? null), note: s => s.bank?.sources?.length ? s.bank.sources.join(" · ") : "" },
  { label: "Қайтарым үлесі", hint: "Қайтарым ÷ оборот", value: s => share(s.bank?.refunds, s.bank?.gross) },
  { label: "Банк комиссиясы үлесі", hint: "Комиссия ÷ оборот", value: s => share(s.bank?.commission, s.bank?.gross) },
  { label: "Табыс (таза түсім)", hint: "Оборот − қайтарым − комиссия − салық; выписка жоқ айда — қолмен енгізілген", value: s => money(s.revenue), note: sourceNote },
  { label: "Сатылым саны", hint: "Выпискадағы төлемдер", value: s => formatCount(s.unit.sales) },
  { label: "Орташа чек", value: s => money(s.unit.avgCheck) },
  { label: "Оқушы / клиент саны", value: (s, id) => s.unit.units === null ? "—" : `${formatCount(s.unit.units)} ${id ? unitLabel(id) : ""}` },
  { label: "ARPU — бір оқушы табысы", hint: "Табыс ÷ оқушы саны", value: s => money(s.unit.arpu) },
  { label: "Бір оқушы үшін шығын", hint: "Операциялық шығын ÷ оқушы", value: s => money(s.unit.costPerUnit) },
  { label: "ФОТ бір оқушы үшін", value: s => money(s.unit.payrollPerUnit) },
  { label: "Юнит маржасы", hint: "ARPU − айнымалы шығын", value: s => money(s.unit.contributionPerUnit) },
  { label: "Бір оқушы пайдасы", hint: "Нәтиже ÷ оқушы", value: s => money(s.unit.profitPerUnit), tone: s => (s.unit.profitPerUnit ?? 0) < 0 ? "negative" : "" },
  { label: "Бір сатылым пайдасы", hint: "Нәтиже ÷ сатылым саны", value: s => money(s.unit.profitPerSale), tone: s => (s.unit.profitPerSale ?? 0) < 0 ? "negative" : "" },
  { label: "LTV", hint: "Юнит маржасы × оқу мерзімі", value: s => money(s.unit.ltv) },
  { label: "CAC", hint: "Маркетинг ÷ жаңа клиент", value: s => money(s.funnel.cac) },
  { label: "LTV / CAC", hint: "3× және жоғары — сау", value: s => s.unit.ltvCac === null ? "—" : `${formatCount(s.unit.ltvCac, 1)}×`, tone: s => s.unit.ltvCac === null ? "" : s.unit.ltvCac < 1 ? "negative" : s.unit.ltvCac < 3 ? "warn" : "positive" },
  { label: "CAC өтелу мерзімі", hint: "CAC ÷ юнит маржасы", value: s => s.unit.paybackMonths === null ? "—" : `${formatCount(s.unit.paybackMonths, 1)} ай` },
  { label: "Залалсыздық нүктесі", hint: "Тұрақты шығынды жабатын оқушы саны", value: s => s.unit.breakEvenUnits === null ? "—" : formatCount(s.unit.breakEvenUnits) },
  { label: "Шығынды жабуға керек сатылым", hint: "Операциялық шығын ÷ бір сатылымның таза түсімі", value: s => s.unit.breakEvenSales === null ? "—" : formatCount(s.unit.breakEvenSales) },
  { label: "Операциялық маржа", value: s => formatPercent(s.margin), tone: s => (s.margin ?? 0) < 0 ? "negative" : "" },
];
const funnelRows: Row[] = [
  { label: "Таргет шығыны, ₸", value: s => money(s.funnel.spend) },
  { label: "Оның ішінде USD", value: s => s.funnel.spendUsd === null ? "—" : `$ ${formatCount(s.funnel.spendUsd, 2)}` },
  { label: "Лидтер", value: s => formatCount(s.funnel.leads) },
  { label: "Жаңа ақылы клиенттер", value: s => formatCount(s.funnel.customers) },
  { label: "Лид → клиент конверсиясы", value: s => formatPercent(s.funnel.conversion) },
  { label: "CPL — бір лид құны", value: s => money(s.funnel.cpl) },
  { label: "CAC — бір клиент құны", value: s => money(s.funnel.cac) },
  { label: "ROMI", hint: "LTV бар болса LTV бойынша, әйтпесе 1 ай", value: (s, id) => id ? formatPercent(s.unit.romi, 0) : "—", tone: s => s.unit.romi === null ? "" : s.unit.romi < 0 ? "negative" : "positive" },
  { label: "Маркетинг / табыс", value: s => formatPercent(s.marketingShare) },
];

// Phones show one project at a time: the choice drives the metrics list, the CAC/CPL history and the form.
const mobileProject = ref("");
watch([projects, focus], ([list, focused]) => {
  if (focused && list.some(p => p.id === focused)) mobileProject.value = focused;
  // Wait for the projects: choosing before they load would fall back to «all» and show every form.
  else if (list.length && (!mobileProject.value || (mobileProject.value !== "all" && !list.some(p => p.id === mobileProject.value)))) mobileProject.value = list[0]!.id;
}, { immediate: true });
const mobileSummary = computed(() => (mobileProject.value === "all" ? total.value : summaries.value[mobileProject.value] ?? total.value) as FinanceSummary);
const mobileId = computed(() => mobileProject.value === "all" ? null : mobileProject.value);
const mobileGroups = computed(() => [{ title: "Юнит-экономика", rows: unitRows }, { title: "Таргет воронкасы", rows: funnelRows }]);

const chart = computed(() => {
  const window = finance.data.value?.window ?? [];
  return {
    labels: window.map(p => periodLabel(p, true)),
    details: window.map(p => periodLabel(p)),
    series: projects.value.map(p => ({ key: p.id, label: p.name, color: finance.colorOf(p.id), values: finance.trendOf(p.id).map(t => t.hasData ? t.groups.marketing : null) })),
  };
});
</script>

<template>
  <div class="analytics-page">
    <AnalyticsHeader />

    <p v-if="finance.error.value" class="finance-error" role="alert">{{ finance.error.value }}</p>
    <div v-if="!finance.data.value" class="analytics-skeleton" aria-busy="true"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">{{ periodLabel(period) }}</span><h2>Жобаларды салыстыру</h2></div><small class="panel-note">«—» — дерек енгізілмеген</small></header>
        <div class="unit-mobile">
          <nav class="bank-chips unit-mobile-tabs" aria-label="Жоба">
            <button v-for="p in projects" :key="p.id" type="button" :class="{ active: mobileProject === p.id }" :style="{ '--chip': finance.colorOf(p.id) }" @click="mobileProject = p.id"><i />{{ p.name }}</button>
            <button type="button" :class="{ active: mobileProject === 'all' }" @click="mobileProject = 'all'">Барлығы</button>
          </nav>
          <template v-for="group in mobileGroups" :key="group.title">
            <h3 class="unit-mobile-title">{{ group.title }}</h3>
            <dl class="unit-mobile-list">
              <div v-for="row in group.rows" :key="row.label" :class="row.tone?.(mobileSummary)">
                <dt>{{ row.label }}<small v-if="row.hint">{{ row.hint }}</small></dt>
                <dd>{{ row.value(mobileSummary, mobileId) }}<small v-if="row.note?.(mobileSummary)" :class="{ 'from-bank': mobileSummary.revenueSource === 'bank' }">{{ row.note(mobileSummary) }}</small></dd>
              </div>
            </dl>
          </template>
        </div>
        <div class="table-scroll unit-desktop">
          <table class="pnl-table">
            <thead><tr><th scope="col">Көрсеткіш</th><th v-for="p in projects" :key="p.id" scope="col"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}</th><th scope="col" class="total-col">Барлығы</th></tr></thead>
            <tbody>
              <tr class="pnl-section"><th :colspan="projects.length + 2" scope="rowgroup">Юнит-экономика</th></tr>
              <tr v-for="row in unitRows" :key="row.label">
                <th scope="row">{{ row.label }}<small v-if="row.hint">{{ row.hint }}</small></th>
                <td v-for="p in projects" :key="p.id" :class="row.tone?.(summaries[p.id]!)">{{ row.value(summaries[p.id]!, p.id) }}<small v-if="row.note?.(summaries[p.id]!)" class="cell-sub" :class="{ 'from-bank': summaries[p.id]!.revenueSource === 'bank' }">{{ row.note(summaries[p.id]!) }}</small></td>
                <td class="total-col">{{ row.value(total, null) }}</td>
              </tr>
              <tr class="pnl-section"><th :colspan="projects.length + 2" scope="rowgroup">Таргет воронкасы</th></tr>
              <tr v-for="row in funnelRows" :key="row.label">
                <th scope="row">{{ row.label }}<small v-if="row.hint">{{ row.hint }}</small></th>
                <td v-for="p in projects" :key="p.id" :class="row.tone?.(summaries[p.id]!)">{{ row.value(summaries[p.id]!, p.id) }}</td>
                <td class="total-col">{{ row.value(total, null) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">Выписка бар айда табыс — банк выпискасындағы таза түсім (қайтарым, комиссия және көрсетілген салықтан кейін); жоқ айда — қолмен енгізілген табыс. Юнит көрсеткіштері жобалар арасында қосылмайды: әр жобаның оқушысы әртүрлі. Жалпы CPL/CAC тек таргеті бар барлық жоба лид пен клиент санын енгізгенде есептеледі.</p>
      </section>

      <div class="analytics-columns even">
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">6 ай</span><h2>Таргет шығыны жобалар бойынша</h2></div></header>
          <ChartColumns caption="Таргет шығыны айлар бойынша" :labels="chart.labels" :details="chart.details" :series="chart.series" :format="money" :axis-format="compactMoney" :height="240" />
        </section>
        <section class="panel analytics-panel">
          <header><div><span class="eyebrow">Динамика</span><h2>CAC және CPL айлар бойынша</h2></div></header>
          <ul v-if="mobileId" class="unit-mobile-trend">
            <li v-for="t in finance.trendOf(mobileId)" :key="t.period"><span>{{ periodLabel(t.period) }}</span><b>CAC {{ compactMoney(t.cac) }}</b><small>CPL {{ compactMoney(t.cpl) }}</small></li>
          </ul>
          <p v-else class="unit-mobile-trend-note">Жобаны жоғарыдан таңдаңыз.</p>
          <div class="table-scroll unit-desktop">
            <table class="pnl-table compact">
              <thead><tr><th scope="col">Жоба</th><th v-for="p in finance.data.value.window" :key="p" scope="col">{{ periodLabel(p, true) }}</th></tr></thead>
              <tbody>
                <template v-for="p in projects" :key="p.id">
                  <tr><th scope="row"><i :style="{ background: finance.colorOf(p.id) }" />{{ p.name }}<small>CAC · CPL</small></th><td v-for="t in finance.trendOf(p.id)" :key="t.period">{{ compactMoney(t.cac) }}<small class="cell-sub">{{ compactMoney(t.cpl) }}</small></td></tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="metrics-entry" aria-label="Айлық деректерді енгізу">
        <header><span class="eyebrow">Деректерді енгізу · {{ periodLabel(period) }}</span><h2>Әр жобаның айлық көрсеткіштері</h2><p>Бос өріс — «дерек жоқ». Нақты нөл болса, 0 деп жазыңыз. Таргет шығыны реестрге жеке жазба болып түседі.</p></header>
        <nav class="bank-chips unit-mobile-tabs unit-mobile-only" aria-label="Қай жобаның деректері">
          <button v-for="p in projects" :key="p.id" type="button" :class="{ active: mobileProject === p.id }" :style="{ '--chip': finance.colorOf(p.id) }" @click="mobileProject = p.id"><i />{{ p.name }}<b v-if="dirty(p.id)">•</b></button>
        </nav>
        <div class="metrics-grid">
          <form v-for="p in projects" :id="`metrics-${p.id}`" :key="p.id" class="panel metrics-card" :class="{ focus: focus === p.id, 'mobile-hidden': mobileProject !== 'all' && mobileProject !== p.id }" :style="{ '--project': finance.colorOf(p.id) }" @submit.prevent="save(p.id)">
            <header>
              <h3><i />{{ p.name }}</h3>
              <span v-if="dirty(p.id)" class="dirty-flag">Сақталмаған</span>
            </header>
            <div v-if="drafts[p.id]" class="metrics-fields">
              <label v-for="f in fields" :key="f.key" class="form-field">
                <span>{{ f.label }}</span>
                <input v-model="drafts[p.id]![f.key]" type="number" min="0" :step="f.step || '0.01'" placeholder="Енгізілмеген" :inputmode="f.step === '1' ? 'numeric' : 'decimal'">
                <small v-if="f.key === 'revenue' && finance.bankFactsOf(p.id)" class="from-bank">Выписка бойынша: <b>{{ money(finance.bankFactsOf(p.id)!.net) }}</b> — есепте осы қолданылады. Қолмен енгізген сан тек выписка жоқ айларда қолданылады.</small>
                <small v-else><template v-if="f.money && drafts[p.id]![f.key] !== null && drafts[p.id]![f.key] !== ''"><b>{{ money(Number(drafts[p.id]![f.key])) }}</b> · </template>{{ f.hint }}<template v-if="f.key === 'units' && previousOf(p.id)?.units !== null && previousOf(p.id)?.units !== undefined"> · өткен айда {{ formatCount(previousOf(p.id)!.units) }}</template></small>
              </label>
              <label class="form-field"><span>Юнит түрі</span><select v-model="drafts[p.id]!.unitType"><option value="client">Оқушы / клиент</option><option value="order">Тапсырыс</option><option value="service">Қызмет</option></select></label>
              <div class="form-field target-summary">
                <span>Осы айдағы таргет</span>
                <strong>{{ money(summaries[p.id]?.funnel.spend) }}</strong>
                <button type="button" class="text-button" @click="addTarget(p.id)"><CirclePlus :size="14" /> Таргет шығынын қосу</button>
              </div>
              <label class="finance-check form-field wide"><input v-model="drafts[p.id]!.marketingAligned" type="checkbox"> Таргет, лидтер және клиенттер бір кезеңге (осы айға) жатады</label>
              <label class="finance-check form-field wide"><input v-model="drafts[p.id]!.costsReviewed" type="checkbox"> Шығындар тексерілді: айнымалы / тұрақты дұрыс белгіленген</label>
              <label class="form-field wide"><span>Ескертпе / дереккөз</span><textarea v-model="drafts[p.id]!.notes" rows="2" maxlength="1200" placeholder="Мысалы: CRM есебі, 1–30 қыркүйек" /></label>
            </div>
            <footer>
              <p v-if="messages[p.id]" :class="messages[p.id]!.ok ? 'finance-success' : 'finance-error'" role="status">{{ messages[p.id]!.text }}</p>
              <button class="button primary" :disabled="saving[p.id] || !dirty(p.id)"><Save :size="16" /> {{ saving[p.id] ? "Сақталуда…" : "Сақтау" }}</button>
            </footer>
          </form>
        </div>
      </section>
    </template>

  </div>
</template>
