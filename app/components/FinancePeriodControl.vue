<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

const finance = useFinance();
const label = computed(() => periodLabel(finance.period.value));
</script>

<template>
  <div class="period-switch" role="group" aria-label="Есептік ай">
    <button type="button" aria-label="Алдыңғы ай" @click="finance.setPeriod(shiftPeriod(finance.period.value, -1))"><ChevronLeft :size="18" /></button>
    <label>
      <span>Есептік ай</span>
      <strong>{{ label }}</strong>
      <input type="month" :value="finance.period.value" min="2020-01" max="2099-12" aria-label="Айды таңдау" @change="finance.setPeriod(($event.target as HTMLInputElement).value)">
    </label>
    <button type="button" aria-label="Келесі ай" @click="finance.setPeriod(shiftPeriod(finance.period.value, 1))"><ChevronRight :size="18" /></button>
  </div>
</template>
