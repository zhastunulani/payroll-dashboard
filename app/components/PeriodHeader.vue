<script setup lang="ts">
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Info, X } from "lucide-vue-next";

/** Header of the Payroll operations: which profile (project) and which opened month. */
const payroll = usePayroll();
const route = useRoute();
const ctx = useAppContext();
const { t } = useLocale();
const monthModal = ref(false);
const monthTarget = ref<string | undefined>();
const exportModal = ref(false);
const requestedMonth = useState<string | null>("payroll:requested-month", () => null);

const titles: Record<string, { eyebrow: string; title: string; text: string }> = {
  "/departments": { eyebrow: "Айлық төлемі", title: "Айлық төлемі", text: "Кімге қанша төлеу керек, кім алды — бөлімдер бойынша" },
  "/expenses": { eyebrow: "Шығындар", title: "Шығындар", text: "Міндетті төлемдер (аренда, интернет, подписка) және бір реттік шығындар" },
  "/other-expenses": { eyebrow: "Шығындар", title: "Шығындар", text: "Міндетті төлемдер және бір реттік шығындар" },
  "/smz": { eyebrow: "Төлем маршруты", title: "SMZ бойынша бөлу", text: "Айлықтарды лимит пен қызметтік деңгейге сай бөліңіз" },
  "/settings": { eyebrow: "Жүйе", title: "Баптаулар", text: "Айлар, команда және анықтамалықтар" },
};
const heading = computed(() => titles[route.path] ?? titles["/departments"]!);
const monthOptions = computed(() => payroll.data.value?.months.map(item => ({
  value: item.id,
  // Built here rather than taken from the server's Kazakh `label`, so it follows the language.
  label: monthName(item),
  description: `${item.year} ${t("жыл")} · ${String(item.month).padStart(2, "0")} ${t("ай")}`,
  keywords: `${item.year} ${item.month}`,
})) || []);
const currentIndex = computed(() => payroll.data.value?.months.findIndex(item => item.id === payroll.data.value?.selectedMonth.id) ?? -1);
const canOlder = computed(() => currentIndex.value >= 0 && currentIndex.value < (payroll.data.value?.months.length || 0) - 1);
const canNewer = computed(() => currentIndex.value > 0);
const missingMonth = computed(() => requestedMonth.value && payroll.data.value && payroll.data.value.selectedMonth.id !== requestedMonth.value ? requestedMonth.value : null);

function chooseMonth(month: string) {
  requestedMonth.value = null;
  if (month !== payroll.data.value?.selectedMonth.id) payroll.load(month);
}
function move(offset: number) {
  const target = payroll.data.value?.months[currentIndex.value + offset];
  if (target) chooseMonth(target.id);
}
function openMonth(target?: string) {
  monthTarget.value = target;
  monthModal.value = true;
}
</script>

<template>
  <header class="period-header payroll-header" :style="{ '--project': ctx.workspaceColor.value }">
    <div class="page-heading">
      <span class="eyebrow context-eyebrow"><i />{{ payroll.data.value?.selectedWorkspace.name }} · {{ t(heading.eyebrow) }}</span>
      <h1>{{ t(heading.title) }}</h1>
      <p>{{ t(heading.text) }}</p>
    </div>
    <div v-if="payroll.data.value" class="period-controls">
      <div class="month-control">
        <button type="button" :aria-label="t('Алдыңғы ай')" :disabled="!canOlder" @click="move(1)"><ChevronLeft :size="18" /></button>
        <UiSmartSelect
          :model-value="payroll.data.value.selectedMonth.id"
          :options="monthOptions"
          :label="t('Есептік кезең')"
          :search-placeholder="t('Айды немесе жылды іздеу')"
          @update:model-value="chooseMonth"
        />
        <button type="button" :aria-label="t('Келесі ай')" :disabled="!canNewer" @click="move(-1)"><ChevronRight :size="18" /></button>
      </div>
      <button class="button secondary export-button" type="button" @click="exportModal = true"><Download :size="17" /><span>{{ t("Ведомость") }}</span></button>
      <button class="button primary new-month-button" type="button" @click="openMonth()"><CalendarPlus :size="18" /><span><strong>{{ t("Жаңа ай") }}</strong><small>{{ t("Есепті көшіру") }}</small></span></button>
    </div>
  </header>
  <div v-if="missingMonth && payroll.data.value" class="gate-banner" role="status">
    <Info :size="17" />
    <span>{{ payroll.data.value.selectedWorkspace.name }}: <b>{{ periodLabel(missingMonth) }}</b> {{ t("әлі ашылмаған, сондықтан") }} <b>{{ monthName(payroll.data.value.selectedMonth) }}</b>{{ t(" көрсетілді.") }}</span>
    <button class="button secondary" type="button" @click="openMonth(missingMonth)"><CalendarPlus :size="16" /> {{ t("Айды ашу") }}</button>
    <button class="icon-button" type="button" :aria-label="t('Жабу')" @click="requestedMonth = null"><X :size="16" /></button>
  </div>

  <MonthCreateModal v-if="monthModal" :target="monthTarget" @close="monthModal = false; requestedMonth = null" />
  <PayrollExportModal v-if="exportModal" @close="exportModal = false" />
</template>
