<script setup lang="ts">
import { RefreshCw, TriangleAlert, Plug, Check, CalendarClock } from "lucide-vue-next";
import { reachNote, regionLabel } from "../../lib/meta";

/**
 * Meta advertising: what the ad cabinet actually charged, in ₸, per project and month.
 *
 * The per-project division and the ₸ conversion are done on the server (`metaFactsByPeriod`), so this
 * panel shows exactly the numbers the reports use — there is no second calculation to disagree with.
 */
const meta = useMeta();
const finance = useFinance();
const { period } = meta;
onMounted(meta.load);
watch(period, meta.load);

const accounts = computed(() => meta.data.value?.accounts ?? []);
const spending = computed(() => accounts.value.filter(a => a.days > 0));
const token = computed(() => meta.data.value?.token ?? null);
const projects = computed(() => finance.projects.value);

/**
 * Per-project facts come from `/api/meta`, which runs the same server-side attribution the reports
 * use, so the panel and the P&L can never disagree. The finance layer is only asked for the project
 * list and colours.
 */
const factsOf = (projectId: string, forPeriod: string) => meta.data.value?.history?.[projectId]?.[forPeriod] ?? null;
const rows = computed(() => projects.value
  .map(p => ({ project: p, facts: factsOf(p.id, period.value) }))
  .filter(r => r.facts !== null)
  .sort((a, b) => (b.facts!.spendKzt ?? 0) - (a.facts!.spendKzt ?? 0)));
const totalKzt = computed(() => rows.value.reduce((a, r) => a + (r.facts!.spendKzt ?? 0), 0));
const totalUsd = computed(() => Math.round(rows.value.reduce((a, r) => a + r.facts!.spend, 0) * 100) / 100);
/** The whole cabinet for the month, whether or not it has been divided between projects. */
const cabinet = computed(() => meta.totalFacts());
const missingRates = computed(() => cabinet.value?.missingRateDays ?? []);
const effectiveRate = computed(() => totalUsd.value > 0 ? Math.round((totalKzt.value / totalUsd.value) * 100) / 100 : null);

/** Month by month, every project: the history the owner asked to see. */
const history = computed(() => {
  const months = (meta.data.value?.months ?? []).filter(m => projects.value.some(p => factsOf(p.id, m)));
  const list = projects.value.map(p => ({
    project: p,
    cells: months.map(m => factsOf(p.id, m)),
  })).filter(r => r.cells.some(c => c && (c.spendKzt ?? 0) > 0));
  return {
    months,
    list,
    totals: months.map((_, i) => list.reduce((a, r) => a + (r.cells[i]?.spendKzt ?? 0), 0)),
  };
});
const historyChart = computed(() => ({
  labels: history.value.months.map(m => periodLabel(m, true)),
  details: history.value.months.map(m => periodLabel(m)),
  series: history.value.list.map(r => ({
    key: r.project.id,
    label: r.project.name,
    color: finance.colorOf(r.project.id),
    values: r.cells.map(c => c?.spendKzt ?? null),
  })),
}));

const tokenState = computed(() => {
  const t = token.value;
  if (!t?.present) return { tone: "off", text: "Токен қосылмаған" };
  if (!t.valid) return { tone: "bad", text: "Токен жарамсыз немесе мерзімі бітті" };
  const expires = t.expiresAt ? new Date(t.expiresAt) : null;
  if (!expires) return { tone: "good", text: "Тұрақты токен" };
  const hours = (expires.getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return { tone: "bad", text: "Токеннің мерзімі бітті" };
  if (hours < 72) return { tone: "warn", text: `Токен ${hours < 1 ? "1 сағаттан аз" : `${Math.round(hours)} сағат`} ішінде бітеді` };
  return { tone: "good", text: `Токен ${expires.toLocaleDateString("ru-RU")} дейін` };
});
const missingScope = computed(() => {
  const t = token.value;
  return t?.present && t.valid && !t.scopes.includes("ads_read");
});
/** Accounts that spend but have not been told where the money belongs. */
const undecided = computed(() => spending.value.filter(a => a.splitMode === "none"));

const daily = computed(() => {
  const list = meta.series(null).filter(r => r.date >= `${period.value}-01` && r.date <= `${period.value}-31`);
  const rateOf = new Map((meta.data.value?.dailyRates ?? []).map(r => [r.day, r.rate]));
  return {
    labels: list.map(r => r.date.slice(8)),
    details: list.map(r => new Date(`${r.date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })),
    series: [{
      key: "spend", label: "Күндік шығын, ₸", color: "#2563eb",
      values: list.map(r => { const rate = rateOf.get(r.date); return rate ? Math.round(r.spend * rate) : null; }),
    }],
  };
});

/** Regions with spend this month, largest first, each with the project it is assigned to. */
const regions = computed(() => {
  const list = meta.regions();
  const total = list.reduce((a, r) => a + r.spend, 0);
  const rules = new Map((meta.data.value?.regionRules ?? []).map(r => [r.region, r]));
  return list.map(r => ({
    ...r,
    share: total > 0 ? r.spend / total : 0,
    rule: rules.get(r.region) ?? null,
  }));
});
const showAllRegions = ref(false);
const visibleRegions = computed(() => showAllRegions.value ? regions.value : regions.value.slice(0, 8));

const busy = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);
const run = async (label: string, work: () => Promise<string>) => {
  busy.value = true;
  message.value = null;
  try {
    message.value = { ok: true, text: await work() };
    await finance.load();
  } catch (e) {
    message.value = { ok: false, text: messageOf(e, `${label} орындалмады.`) };
  } finally {
    busy.value = false;
  }
};

const sync = () => run("Жаңарту", async () => {
  const to = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 11, 1);
  const r = await meta.sync(start.toISOString().slice(0, 10), to);
  return r.skipped.length
    ? `${r.accounts} кабинет оқылды, ${r.days} күн, ${r.rates} бағам. Оқылмағаны: ${r.skipped.map(s => s.reason).join("; ")}`
    : `${r.accounts} кабинет оқылды, ${r.days} күн жазылды, ${r.rates} күннің бағамы алынды.`;
});
const fetchRates = () => run("Бағам", async () => {
  const r = await meta.backfillRates();
  return r.missing.length
    ? `${r.fetched} күннің бағамы алынды; ${r.missing.length} күн бағамсыз қалды (${r.missing.slice(0, 3).join(", ")}…).`
    : `${r.fetched} күннің бағамы Ұлттық Банктен алынды.`;
});
const setSplit = (id: string, value: string) => run("Кабинет", async () => {
  await meta.saveAccount(id, value === "region" || value === "" ? null : value, true, "", value === "region" ? "region" : "none");
  return value === "region" ? "Кабинет өңірлер бойынша бөлінеді." : value === "" ? "Кабинет жобаға жатқызылмады." : "Кабинет жобаға жатқызылды.";
});
const setRegion = (region: string, value: string) => run("Өңір", async () => {
  await meta.saveRegion(region, value === "" ? null : value, value === "auto");
  return "Өңір сақталды.";
});
</script>

<template>
  <section class="panel analytics-panel meta-panel" aria-label="Meta жарнама">
    <header>
      <div>
        <span class="eyebrow">Meta · Facebook / Instagram</span>
        <h2>Таргет шығыны — кабинеттен алынған нақты дерек</h2>
      </div>
      <div class="meta-actions">
        <span class="meta-pill" :class="tokenState.tone"><Plug :size="13" />{{ tokenState.text }}</span>
        <button type="button" class="text-button" :disabled="busy" @click="fetchRates"><CalendarClock :size="14" /> Бағам</button>
        <button type="button" class="text-button" :disabled="busy || !token?.present" @click="sync">
          <RefreshCw :size="14" :class="{ spin: busy }" /> Жаңарту
        </button>
      </div>
    </header>

    <p v-if="!token?.present" class="meta-setup">
      Кабинет деректерін тарту үшін серверге <code>META_ACCESS_TOKEN</code> айнымалысы керек. Ол Meta-дағы
      <b>Системный пользователь</b> токені болуы керек — оның мерзімі бітпейді. Рұқсаты:
      <code>ads_read</code> және <code>business_management</code> (соңғысы басқа кабинеттерді көру үшін).
    </p>
    <p v-else-if="missingScope" class="meta-setup warn">
      <TriangleAlert :size="14" /> <span>Токенде <code>ads_read</code> рұқсаты жоқ — шығын сандары келмейді.</span>
    </p>
    <p v-if="message" class="meta-message" :class="{ bad: !message.ok }">
      <component :is="message.ok ? Check : TriangleAlert" :size="14" /> {{ message.text }}
    </p>

    <template v-if="cabinet">
      <div class="kpi-row meta-kpis">
        <KpiTile
          label="Таргет шығыны" :value="money(totalKzt || null)"
          :sub="`$ ${formatCount(totalUsd, 2)}${effectiveRate ? ` · орташа ${formatCount(effectiveRate, 2)} ₸/$` : ''}`"
          tone="brand"
        />
        <KpiTile label="Қамту" :value="formatCount(cabinet.reach ?? cabinet.reachDays)" :sub="reachNote(cabinet)" good-when="up" />
        <KpiTile
          label="Хат жазысу басталды" :value="formatCount(cabinet.conversations)"
          :sub="cabinet.conversations > 0 && totalKzt ? `біреуі ${money(Math.round(totalKzt / cabinet.conversations))}` : ''"
          good-when="up"
        />
        <KpiTile label="CPM" :value="cabinet.cpm === null ? '—' : `$ ${formatCount(cabinet.cpm, 2)}`" :sub="`${formatCount(cabinet.impressions)} көрсетілім · CTR ${formatPercent(cabinet.ctr)}`" />
      </div>

      <p v-if="missingRates.length" class="meta-setup warn">
        <TriangleAlert :size="14" />
        <span>{{ missingRates.length }} күннің бағамы жоқ, сондықтан теңге сомасы толық емес. «Бағам» батырмасын басыңыз.</span>
      </p>
      <p v-if="undecided.length" class="meta-setup warn">
        <TriangleAlert :size="14" />
        <span>
          {{ undecided.map(a => a.name).join(", ") }} — қай жобаға жататыны белгіленбеген, сондықтан бұл
          шығын жобалардың есебіне кірмейді. Төмендегі «Кабинеттер» бөлімінен таңдаңыз.
        </span>
      </p>

      <h3 class="meta-subhead">{{ periodLabel(period) }} — жобалар бойынша</h3>
      <div class="table-scroll">
        <table class="pnl-table compact">
          <thead>
            <tr>
              <th scope="col">Жоба</th><th scope="col">Шығын, ₸</th><th scope="col">Доллар</th>
              <th scope="col">Үлесі</th><th scope="col">Хат жазысу</th><th scope="col">Бір хат құны</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.project.id">
              <th scope="row"><i :style="{ background: finance.colorOf(r.project.id) }" />{{ r.project.name }}</th>
              <td><b>{{ money(r.facts!.spendKzt) }}</b></td>
              <td>$ {{ formatCount(r.facts!.spend, 2) }}</td>
              <td>{{ formatPercent(totalKzt > 0 ? (r.facts!.spendKzt ?? 0) / totalKzt : null) }}</td>
              <td>{{ formatCount(r.facts!.conversations) }}</td>
              <td>{{ r.facts!.conversations > 0 && r.facts!.spendKzt ? money(Math.round(r.facts!.spendKzt / r.facts!.conversations)) : "—" }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="6" class="meta-empty">Кабинет ешбір жобаға жатқызылмаған — төмендегі бөлімнен таңдаңыз.</td></tr>
            <tr v-else class="pnl-total">
              <th scope="row">Барлығы</th>
              <td><b>{{ money(totalKzt) }}</b></td>
              <td>$ {{ formatCount(totalUsd, 2) }}</td>
              <td>100%</td>
              <td>{{ formatCount(cabinet.conversations) }}</td>
              <td>{{ cabinet.conversations > 0 && totalKzt ? money(Math.round(totalKzt / cabinet.conversations)) : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="history.list.length">
        <h3 class="meta-subhead">Ай сайынғы таргет шығыны, ₸</h3>
        <ChartColumns
          caption="Таргет шығыны айлар бойынша, теңге" :labels="historyChart.labels" :details="historyChart.details"
          :series="historyChart.series" :format="money" :axis-format="compactMoney" :height="220"
        />
        <div class="table-scroll">
          <table class="pnl-table compact">
            <thead><tr><th scope="col">Жоба</th><th v-for="m in history.months" :key="m" scope="col">{{ periodLabel(m, true) }}</th></tr></thead>
            <tbody>
              <tr v-for="r in history.list" :key="r.project.id">
                <th scope="row"><i :style="{ background: finance.colorOf(r.project.id) }" />{{ r.project.name }}</th>
                <td v-for="(c, i) in r.cells" :key="i">{{ c ? compactMoney(c.spendKzt) : "—" }}</td>
              </tr>
              <tr class="pnl-total">
                <th scope="row">Барлығы</th>
                <td v-for="(t, i) in history.totals" :key="i"><b>{{ t ? compactMoney(t) : "—" }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <h3 class="meta-subhead">{{ periodLabel(period) }} — күндер бойынша</h3>
      <ChartColumns
        caption="Күндік таргет шығыны, теңге" :labels="daily.labels" :details="daily.details"
        :series="daily.series" :format="money" :axis-format="compactMoney" :height="200"
      />

      <h3 v-if="regions.length" class="meta-subhead">Өңірлер бойынша — ақша қайда кетті</h3>
      <div v-if="regions.length" class="table-scroll">
        <table class="pnl-table compact">
          <thead><tr><th scope="col">Өңір</th><th scope="col">Шығын</th><th scope="col">Үлесі</th><th scope="col">Жоба</th></tr></thead>
          <tbody>
            <tr v-for="r in visibleRegions" :key="r.region">
              <th scope="row">{{ regionLabel(r.region) }}</th>
              <td>$ {{ formatCount(r.spend, 2) }}</td>
              <td>{{ formatPercent(r.share) }}</td>
              <td>
                <select :value="r.rule?.builtin === false ? (r.rule?.projectId ?? '') : 'auto'" :disabled="busy" @change="setRegion(r.region, ($event.target as HTMLSelectElement).value)">
                  <option value="auto">Автоматты{{ r.rule?.projectId ? ` — ${finance.nameOf(r.rule.projectId)}` : "" }}</option>
                  <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                  <option value="">Жобасыз (есепке кірмейді)</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="regions.length > 8" type="button" class="text-button" @click="showAllRegions = !showAllRegions">
        {{ showAllRegions ? "Тек негізгілерін көрсету" : `Барлық ${regions.length} өңірді көрсету` }}
      </button>
      <p class="panel-footnote">
        Жарнама бүкіл Қазақстанға кетеді. Өңір арқылы бөлу — Meta-ның өз дерегі, сондықтан жобалардың
        қосындысы кабинеттің сомасына тиынына дейін тең. Жамбыл → Тараз, Қызылорда → Қызылорда, қалғаны
        негізгі жобаға (онлайн сатылым сол жерде есептеледі). Кез келген өңірді қолмен ауыстыруға болады.
      </p>
    </template>
    <p v-else-if="token?.present" class="meta-note">Бұл айға дерек жоқ. «Жаңарту» батырмасын басып, кабинеттен тартыңыз.</p>

    <details class="meta-settings">
      <summary>Кабинеттер</summary>
      <div v-if="spending.length" class="table-scroll">
        <table class="pnl-table compact">
          <thead><tr><th scope="col">Кабинет</th><th scope="col">Дерек</th><th scope="col">Қалай бөлінеді</th></tr></thead>
          <tbody>
            <tr v-for="a in spending" :key="a.id">
              <th scope="row">{{ a.name }}<small>{{ a.currency }} · {{ a.id }}</small></th>
              <td>{{ a.days }} күн<small class="cell-sub">{{ a.firstDate }} → {{ a.lastDate }}</small></td>
              <td>
                <select :value="a.splitMode === 'region' ? 'region' : (a.projectId ?? '')" :disabled="busy" @change="setSplit(a.id, ($event.target as HTMLSelectElement).value)">
                  <option value="">Шешілмеген — есепке кірмейді</option>
                  <option value="region">Өңірлер бойынша бөлу</option>
                  <option v-for="p in projects" :key="p.id" :value="p.id">Толығымен: {{ p.name }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-footnote">
        Теңге сомасы ҚР Ұлттық Банкінің сол күнгі ресми бағамымен есептеледі — әр күн өз бағамымен,
        себебі бағам жыл ішінде айтарлықтай өзгереді. Кабинеттің шығыны реестрдегі қолмен жазылған
        «Таргет» сомасын ауыстырады, екеуі қосылмайды.
      </p>
    </details>
  </section>
</template>
