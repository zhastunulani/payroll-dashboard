<script setup lang="ts">
import { CirclePlus, RefreshCw } from "lucide-vue-next";

/** Header of the reports: they always cover all projects, so only the month is chosen here. */
const route = useRoute();
const finance = useFinance();
const { t } = useLocale();
const titles: Record<string, { eyebrow: string; title: string; text: string }> = {
  "/": { eyebrow: "Басқару есебі · барлық жоба", title: "Қаржылық шолу", text: "Әр жобаның айлығы, міндетті төлемдері, таргеті, басқа шығындары және нәтижесі" },
  "/finance": { eyebrow: "Жоба бойынша P&L", title: "Жоба есебі", text: "Төлемдер, P&L, ФОТ, таргет, юнит-экономика және толық реестр" },
  "/unit-economics": { eyebrow: "Бизнес-модель", title: "Юнит-экономика және таргет", text: "Бір оқушы қанша әкеледі, қаншаға тартылады және қашан өтеледі" },
  "/bank": { eyebrow: "Нақты ақша · барлық жоба", title: "Банк выпискалары", text: "Kaspi Pay және Halyk выпискалары: жүктеу, жобаға бөлу, нақты түсімдер және сверка" },
};
const heading = computed(() => titles[route.path] ?? titles["/"]!);
</script>

<template>
  <header class="analytics-header analytics-top">
    <div>
      <span class="eyebrow">{{ t(heading.eyebrow) }}</span>
      <h1>{{ t(heading.title) }}</h1>
      <p>{{ t(heading.text) }}</p>
    </div>
    <div class="analytics-actions">
      <FinancePeriodControl />
      <slot name="actions">
        <button class="button secondary icon-only" type="button" :aria-label="t('Жаңарту')" :disabled="finance.loading.value" @click="finance.load"><RefreshCw :size="17" :class="{ spin: finance.loading.value }" /></button>
        <button class="button primary" type="button" :disabled="!finance.data.value" @click="finance.openEntry()"><CirclePlus :size="17" /> {{ t("Шығын қосу") }}</button>
      </slot>
    </div>
  </header>
</template>
