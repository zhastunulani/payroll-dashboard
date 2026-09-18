<script setup lang="ts">
import { X } from "lucide-vue-next";

const payroll = usePayroll();
const finance = useFinance();
const ctx = useAppContext();
const route = useRoute();
const { t } = useLocale();
const requestedMonth = useState<string | null>("payroll:requested-month", () => null);
const payrollPage = computed(() => PAYROLL_ROUTES.has(route.path));

// The project theme belongs to the payroll profile; the reports cover all projects and keep the neutral look.
const themeClass = computed(() => {
  if (!payrollPage.value) return "theme-default";
  const name = payroll.data.value?.selectedWorkspace.name
    .trim()
    .toLocaleLowerCase("kk-KZ")
    .replace(/[^a-zа-яәіңғүұқөһ0-9]+/giu, "");
  return name === "tamshylab" ? "theme-tamshylab" : "theme-default";
});

// Links from the reports open a payroll profile and month: /departments?workspace=…&month=…
watch(() => [route.path, route.query.workspace, route.query.month] as const, ([path, workspace, month]) => {
  if (!PAYROLL_ROUTES.has(path) || (typeof workspace !== "string" && typeof month !== "string")) return;
  const data = payroll.data.value;
  const targetMonth = typeof month === "string" && PERIOD_PATTERN.test(month) ? month : undefined;
  const targetWorkspace = typeof workspace === "string" ? workspace : data?.selectedWorkspace.id;
  requestedMonth.value = targetMonth ?? null;
  if (!data || data.selectedWorkspace.id !== targetWorkspace || (targetMonth && data.selectedMonth.id !== targetMonth)) payroll.load(targetMonth, targetWorkspace);
  // The address drops the profile and month (later changes happen in the header) but keeps page options like ?tab=.
  const { workspace: _workspace, month: _month, ...rest } = route.query;
  navigateTo({ path, query: rest, hash: route.hash }, { replace: true });
}, { immediate: true });

// Report links carry the month: /?month=… or /finance?project=…&month=…
watch(() => [route.path, route.query.month] as const, ([path, month]) => {
  if (ANALYTICS_ROUTES.has(path) && typeof month === "string") ctx.selectPeriod(month);
}, { immediate: true });
watch(ctx.period, () => { if (FINANCE_ROUTES.has(route.path)) finance.load(); });
</script>

<template>
  <div class="app-frame" :class="themeClass">
    <AppNavigation />
    <main class="workspace">
      <PeriodHeader v-if="payrollPage" />
      <div v-if="payroll.error.value" class="global-alert"><span>{{ t(payroll.error.value) }}</span><button type="button" :aria-label="t('Жабу')" @click="payroll.error.value = ''"><X :size="17" /></button></div>
      <div v-if="payroll.loading.value && payrollPage" class="page-loading"><i /><span>{{ t("Деректер жаңартылуда…") }}</span></div>
      <slot />
    </main>
    <FinanceEntryModal v-if="finance.entryDraft.value" :entry="finance.entryDraft.value" @close="finance.entryDraft.value = null" @saved="finance.entryDraft.value = null" />
  </div>
</template>
