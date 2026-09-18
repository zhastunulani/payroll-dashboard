<script setup lang="ts">
import { CheckCircle2, FileUp, RefreshCw } from "lucide-vue-next";
import type { BankRule } from "../../lib/bank";

const bank = useBank();
const finance = useFinance();
const route = useRoute();
const { t } = useLocale();
const { data, period } = bank;
onMounted(() => { bank.load(); if (!finance.data.value) finance.load(); });
watch(period, () => bank.load());

type Tab = "operations" | "report" | "uploads" | "rules";
// `name` rather than `t`: a parameter called `t` would shadow the translator inside this callback.
const tab = ref<Tab>((["report", "uploads", "rules"] as const).find(name => name === route.query.tab) ?? (route.query.tab === "reports" ? "report" : "operations"));
const q = (key: string) => typeof route.query[key] === "string" ? route.query[key] as string : "";
// The project filter is shared by the cards, the operations and the report.
const project = ref(q("status") === "waiting" ? "__waiting" : q("project") || "all");
watch(tab, value => navigateTo({ query: { ...route.query, tab: value === "operations" ? undefined : value } }, { replace: true }));

const projects = computed(() => data.value?.projects ?? []);
const colorOf = (id: string) => projectColor(projects.value.findIndex(p => p.id === id));
const projectName = (id: string | null) => projects.value.find(p => p.id === id)?.name ?? "—";
const monthStatements = computed(() => (data.value?.statements ?? []).filter(s => !s.periodFrom || !s.periodTo || (s.periodFrom.slice(0, 7) <= period.value && s.periodTo.slice(0, 7) >= period.value)));
const coveredTo = computed(() => monthStatements.value.map(s => s.periodTo).filter(Boolean).sort().at(-1) ?? null);
const day = (iso: string | null) => iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—";

function selectProject(value: string) {
  project.value = value;
  if (tab.value !== "operations" && tab.value !== "report") tab.value = "operations";
}
const uploadOpen = ref(false);
const notice = ref("");
function uploaded(message: string) {
  uploadOpen.value = false;
  notice.value = message;
}
const ruleDraft = useState<Partial<BankRule> | null>("bank:rule-draft", () => null);
function makeRule(draft: Partial<BankRule>) {
  ruleDraft.value = draft;
  tab.value = "rules";
}
</script>

<template>
  <div class="analytics-page bank-page">
    <AnalyticsHeader>
      <template #actions>
        <button class="button secondary icon-only" type="button" :aria-label="t('Жаңарту')" :disabled="bank.loading.value" @click="bank.load"><RefreshCw :size="17" :class="{ spin: bank.loading.value }" /></button>
        <button class="button primary" type="button" @click="uploadOpen = true"><FileUp :size="17" /> {{ t("Выписка жүктеу") }}</button>
      </template>
    </AnalyticsHeader>
    <p v-if="bank.error.value" class="finance-error" role="alert">{{ bank.error.value }} <button type="button" @click="bank.load">{{ t("Қайта жүктеу") }}</button></p>
    <p v-if="notice" class="bank-done bank-notice" role="status"><CheckCircle2 :size="16" /> {{ notice }}</p>
    <div v-if="!data" class="analytics-skeleton" aria-busy="true"><i v-for="n in 3" :key="n" /></div>

    <section v-else-if="!data.statements.length" class="panel bank-welcome">
      <FileUp :size="30" />
      <h2>{{ t("Алғашқы выписканы жүктеңіз") }}</h2>
      <ol><li><b>{{ t("Жүктеу") }}</b> — {{ t("Kaspi Pay (.xlsx) немесе Halyk (.pdf) выпискасы.") }}</li><li><b>{{ t("Тексеру") }}</b> — {{ t("жүйе файлдағы итогтармен салыстырады.") }}</li><li><b>{{ t("Бөлу") }}</b> — {{ t("операциялар мекенжай бойынша жобаларға бөлінеді; белгісіздерін бір рет өзіңіз таңдайсыз.") }}</li></ol>
      <button class="button primary" type="button" @click="uploadOpen = true"><FileUp :size="17" /> {{ t("Выписка жүктеу") }}</button>
    </section>

    <template v-else>
      <p class="bank-coverage">
        {{ periodLabel(period) }} · {{ monthStatements.length }} выписка
        <template v-if="coveredTo"> · {{ t("деректер {d} дейін").replace("{d}", day(coveredTo)) }}</template>
        · {{ t("соңғы жүктеу") }} {{ data.lastUpdated?.slice(0, 16).replace("T", " ") }}
      </p>
      <BankProjectCards :operations="data.operations" :projects="projects" :color-of="colorOf" :selected="project" @select="selectProject" />
      <BankInbox :operations="data.operations" :projects="projects" :color-of="colorOf" />

      <div class="segmented bank-tabs" role="tablist" :aria-label="t('Бөлім')">
        <button type="button" role="tab" :aria-selected="tab === 'operations'" :class="{ active: tab === 'operations' }" @click="tab = 'operations'">{{ t("Операциялар") }}</button>
        <button type="button" role="tab" :aria-selected="tab === 'report'" :class="{ active: tab === 'report' }" @click="tab = 'report'">{{ t("Есеп") }}</button>
        <button type="button" role="tab" :aria-selected="tab === 'uploads'" :class="{ active: tab === 'uploads' }" @click="tab = 'uploads'">{{ t("Жүктеулер") }} <b>{{ data.statements.length }}</b></button>
        <button type="button" role="tab" :aria-selected="tab === 'rules'" :class="{ active: tab === 'rules' }" @click="tab = 'rules'">{{ t("Ережелер") }} <b>{{ data.rules.filter(r => !r.builtin).length }}</b></button>
      </div>

      <BankOperations v-if="tab === 'operations'" v-model:project="project" :operations="data.operations" :projects="projects" :statements="data.statements" :color-of="colorOf" @rule="makeRule" />
      <template v-else-if="tab === 'report'">
        <BankReports :operations="data.operations" :projects="projects" :statements="monthStatements" :color-of="colorOf" :project="project" />
        <BankCrm :operations="data.operations" :projects="projects" :crm="data.crm" :color-of="colorOf" :selected="project" />
      </template>
      <BankStatements v-else-if="tab === 'uploads'" :statements="data.statements" />
      <BankRules v-else :rules="data.rules" :projects="projects" :operations="data.operations" :color-of="colorOf" />
    </template>

    <UiModal v-if="uploadOpen" :title="t('Выписка жүктеу')" :description="t('Kaspi Pay (.xlsx) немесе Halyk (.pdf)')" wide @close="uploadOpen = false">
      <BankUpload embedded :project-name="projectName" @done="uploaded" />
    </UiModal>
  </div>
</template>
