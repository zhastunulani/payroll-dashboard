<script setup lang="ts">
import { X } from "lucide-vue-next";

const payroll = usePayroll();
const themeClass = computed(() => {
  const name = payroll.data.value?.selectedWorkspace.name
    .trim()
    .toLocaleLowerCase("kk-KZ")
    .replace(/[^a-zа-яәіңғүұқөһ0-9]+/giu, "");
  return name === "tamshylab" ? "theme-tamshylab" : "theme-default";
});
</script>

<template>
  <div class="app-frame" :class="themeClass">
    <AppNavigation />
    <main class="workspace">
      <PeriodHeader />
      <div v-if="payroll.error.value" class="global-alert"><span>{{ payroll.error.value }}</span><button type="button" aria-label="Жабу" @click="payroll.error.value = ''"><X :size="17" /></button></div>
      <div v-if="payroll.loading.value" class="page-loading"><i /><span>Деректер жаңартылуда…</span></div>
      <slot />
    </main>
  </div>
</template>
