<script setup lang="ts">
import { RefreshCw, TriangleAlert, Plug, Check } from "lucide-vue-next";
import { metaMonthRange, reachNote, regionLabel } from "../../lib/meta";

/**
 * Meta advertising for the selected month: what was actually spent, per day and per region, next to the
 * target figure the ledger holds. Money is shown in USD — the currency Meta bills in — and in ₸ only
 * where a rate for the month is known.
 */
const props = defineProps<{ projectId?: string | null }>();

const meta = useMeta();
const finance = useFinance();
const { period } = meta;
onMounted(meta.load);
watch(period, meta.load);

const projectId = computed(() => props.projectId ?? null);
const facts = computed(() => (projectId.value ? meta.factsOf(projectId.value) : meta.totalFacts()));
const range = computed(() => metaMonthRange(period.value));
const accounts = computed(() => meta.data.value?.accounts ?? []);
const spending = computed(() => accounts.value.filter(a => a.days > 0));
const rate = computed(() => meta.data.value?.rates.find(r => r.period === period.value) ?? null);
const token = computed(() => meta.data.value?.token ?? null);

/** Meta's own money, against the target already written into the ledger for the same month. */
const ledger = computed(() => {
  const summary = projectId.value ? finance.summaries.value[projectId.value] : finance.total.value;
  return summary ? { kzt: summary.funnel.spend, usd: summary.funnel.spendUsd } : null;
});
const gap = computed(() => {
  const f = facts.value, l = ledger.value;
  return f && l?.usd ? { usd: Math.round((f.spend - l.usd) * 100) / 100, share: l.usd > 0 ? (f.spend - l.usd) / l.usd : null } : null;
});

const tokenState = computed(() => {
  const t = token.value;
  if (!t?.present) return { tone: "off", text: "Токен қосылмаған" };
  if (!t.valid) return { tone: "bad", text: "Токен жарамсыз немесе мерзімі бітті" };
  const expires = t.expiresAt ? new Date(t.expiresAt) : null;
  if (!expires) return { tone: "good", text: "Тұрақты токен (мерзімі жоқ)" };
  const hours = (expires.getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return { tone: "bad", text: "Токеннің мерзімі бітті" };
  if (hours < 72) return { tone: "warn", text: `Токен ${hours < 1 ? "1 сағаттан аз" : `${Math.round(hours)} сағат`} ішінде бітеді` };
  return { tone: "good", text: `Токен ${expires.toLocaleDateString("ru-RU")} дейін` };
});
const missingScope = computed(() => {
  const t = token.value;
  return t?.present && t.valid && !t.scopes.includes("ads_read");
});

const daily = computed(() => {
  const rows = meta.series(projectId.value).filter(r => r.date >= range.value.from && r.date <= range.value.to);
  return {
    labels: rows.map(r => r.date.slice(8)),
    details: rows.map(r => new Date(`${r.date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })),
    series: [{ key: "spend", label: "Күндік шығын, $", color: "#2563eb", values: rows.map(r => r.spend) }],
  };
});
const regions = computed(() => {
  const rows = meta.regions();
  const total = rows.reduce((a, r) => a + r.spend, 0);
  return rows.map(r => ({ ...r, share: total > 0 ? r.spend / total : 0 }));
});

/** Accounts that spend money but have not been assigned to a project: their spend reaches no P&L. */
const unmapped = computed(() => accounts.value.filter(a => a.days > 0 && (!a.projectId || !a.tracked)));
const mapped = computed(() => meta.mappedFacts());

const usd = (value: number | null) => value === null ? "—" : `$ ${formatCount(value, 2)}`;
const busy = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

async function sync(months: number) {
  busy.value = true;
  message.value = null;
  try {
    const to = new Date().toISOString().slice(0, 10);
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - (months - 1), 1);
    const result = await meta.sync(start.toISOString().slice(0, 10), to);
    message.value = {
      ok: result.ok && !result.skipped.length,
      text: result.skipped.length
        ? `${result.accounts} кабинет оқылды, ${result.days} күн жазылды. Оқылмағаны: ${result.skipped.map(s => s.reason).join("; ")}`
        : `${result.accounts} кабинет оқылды, ${result.days} күн жазылды${result.discovered.length ? `, ${result.discovered.length} жаңа кабинет табылды` : ""}.`,
    };
  } catch (e) {
    message.value = { ok: false, text: messageOf(e, "Meta жаңартылмады.") };
  } finally {
    busy.value = false;
  }
}

const rateDraft = ref<string>("");
watch(rate, r => { rateDraft.value = r ? String(r.rate) : ""; }, { immediate: true });
async function saveRate() {
  busy.value = true;
  try {
    await meta.saveRate(period.value, rateDraft.value === "" ? null : Number(rateDraft.value));
    message.value = { ok: true, text: "Бағам сақталды." };
  } catch (e) {
    message.value = { ok: false, text: messageOf(e, "Бағам сақталмады.") };
  } finally {
    busy.value = false;
  }
}
async function mapAccount(id: string, value: string) {
  busy.value = true;
  try {
    await meta.saveAccount(id, value === "" ? null : value, true);
  } catch (e) {
    message.value = { ok: false, text: messageOf(e, "Кабинет сақталмады.") };
  } finally {
    busy.value = false;
  }
}
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
        <button type="button" class="text-button" :disabled="busy || !token?.present" @click="sync(6)">
          <RefreshCw :size="14" :class="{ spin: busy }" /> Жаңарту
        </button>
      </div>
    </header>

    <p v-if="!token?.present" class="meta-setup">
      Кабинет деректерін тарту үшін серверге <code>META_ACCESS_TOKEN</code> айнымалысы керек. Ол Meta-дағы
      <b>Системный пользователь</b> токені болуы керек — оның мерзімі бітпейді. Рұқсаты: <code>ads_read</code>.
      Қосқан соң осы жердегі «Жаңарту» батырмасы жұмыс істей бастайды.
    </p>
    <p v-else-if="missingScope" class="meta-setup warn">
      <TriangleAlert :size="14" /> Токенде <code>ads_read</code> рұқсаты жоқ — шығын сандары келмейді.
    </p>

    <p v-if="message" class="meta-message" :class="{ bad: !message.ok }">
      <component :is="message.ok ? Check : TriangleAlert" :size="14" /> {{ message.text }}
    </p>

    <template v-if="facts">
      <div class="kpi-row meta-kpis">
        <KpiTile label="Кабинеттегі шығын" :value="usd(facts.spend)" :sub="facts.spendKzt !== null ? `${money(facts.spendKzt)} · бағам ${formatCount(facts.fxRate, 2)} ₸/$` : 'Бағам енгізілмеген — теңге сомасы есептелмеді'" tone="brand" />
        <KpiTile label="Қамту" :value="facts.reach !== null ? formatCount(facts.reach) : formatCount(facts.reachDays)" :sub="reachNote(facts)" good-when="up" />
        <KpiTile label="Хат жазысу басталды" :value="formatCount(facts.conversations)" :sub="facts.costPerConversation !== null ? `біреуі $ ${formatCount(facts.costPerConversation, 2)}` : ''" good-when="up" />
        <KpiTile label="CPM" :value="usd(facts.cpm)" :sub="`${formatCount(facts.impressions)} көрсетілім · CTR ${formatPercent(facts.ctr)}`" />
      </div>

      <p class="meta-note">
        {{ facts.days }} күн дерек бар ({{ facts.firstDate }} → {{ facts.lastDate }}).
        <template v-if="gap">
          Реестрде осы айға <b>{{ usd(ledger!.usd) }}</b> жазылған, кабинетте <b>{{ usd(facts.spend) }}</b> —
          айырма <b :class="gap.usd > 0 ? 'diff-up' : 'diff-down'">{{ gap.usd > 0 ? "+" : "" }}{{ usd(gap.usd) }}</b>.
          Реестрдегі жазба толық айды қамтымауы мүмкін, сондықтан кабинет дерегі әрқашан нақтырақ.
        </template>
      </p>

      <p v-if="unmapped.length" class="meta-setup warn">
        <TriangleAlert :size="14" />
        <span>
          {{ unmapped.map(a => a.name).join(", ") }} — қай жобаға жататыны белгіленбеген, сондықтан бұл шығын
          жобалардың P&amp;L-іне кірмейді<template v-if="mapped">; есепке тек {{ usd(mapped.spend) }} кірген</template>.
          Төмендегі «Кабинеттер және бағам» бөлімінен жобасын таңдаңыз.
        </span>
      </p>

      <ChartColumns
        caption="Күндік таргет шығыны, доллар" :labels="daily.labels" :details="daily.details"
        :series="daily.series" :format="usd" :axis-format="v => `$${Math.round(v)}`" :height="200"
      />

      <h3 v-if="regions.length" class="meta-subhead">Өңірлер бойынша</h3>
      <div v-if="regions.length" class="table-scroll">
        <table class="pnl-table compact">
          <thead><tr><th scope="col">Өңір</th><th scope="col">Шығын</th><th scope="col">Үлесі</th><th scope="col">Басу</th></tr></thead>
          <tbody>
            <tr v-for="r in regions.slice(0, 10)" :key="r.region">
              <th scope="row">{{ regionLabel(r.region) }}</th>
              <td>{{ usd(r.spend) }}</td>
              <td>{{ formatPercent(r.share) }}</td>
              <td>{{ formatCount(r.clicks) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="regions.length > 10" class="panel-footnote">Тағы {{ regions.length - 10 }} өңір бар; жарнама бүкіл Қазақстанға кетеді, сондықтан өңір бойынша бөлу — жобаға жатқызудың бір ғана нұсқасы.</p>
    </template>
    <p v-else-if="token?.present" class="meta-note">Бұл айға дерек жоқ. «Жаңарту» батырмасын басып, кабинеттен тартыңыз.</p>

    <details class="meta-settings">
      <summary>Кабинеттер және бағам</summary>
      <label class="form-field meta-rate">
        <span>{{ periodLabel(period) }} бағамы, ₸ / $</span>
        <input v-model="rateDraft" type="number" min="0" step="0.01" placeholder="Мысалы 450.91" inputmode="decimal" @change="saveRate">
        <small v-if="rate">{{ rate.source }}</small>
        <small v-else>Бағам жоқ болса, теңге сомасы есептелмейді — нөл деп көрсетілмейді.</small>
      </label>
      <div v-if="spending.length" class="table-scroll">
        <table class="pnl-table compact">
          <thead><tr><th scope="col">Кабинет</th><th scope="col">Дерек</th><th scope="col">Жоба</th></tr></thead>
          <tbody>
            <tr v-for="a in spending" :key="a.id">
              <th scope="row">{{ a.name }}<small>{{ a.currency }} · {{ a.id }}</small></th>
              <td>{{ a.days }} күн<small class="cell-sub">{{ a.firstDate }} → {{ a.lastDate }}</small></td>
              <td>
                <select :value="a.projectId ?? ''" @change="mapAccount(a.id, ($event.target as HTMLSelectElement).value)">
                  <option value="">Жобаға жатқызылмаған</option>
                  <option v-for="p in finance.projects.value" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-footnote">
        Тек жобаға жатқызылған кабинеттің шығыны есепке кіреді. Дерегі бар, бірақ жатқызылмаған кабинет
        ешкімнің P&amp;L-іне қосылмайды — әдейі солай: қай жобаның ақшасы екенін тек сіз білесіз.
      </p>
    </details>
  </section>
</template>
