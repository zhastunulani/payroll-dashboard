<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-vue-next";

const props = withDefaults(defineProps<{
  label: string;
  value: number;
  hint: string;
  change?: number | null;
  tone?: "brand" | "success" | "warning" | "neutral";
}>(), { tone: "neutral", change: undefined });
const { formatMoney } = useFormatters();
const changeClass = computed(() => props.change === null || props.change === undefined || props.change === 0 ? "flat" : props.change > 0 ? "up" : "down");
</script>

<template>
  <article class="metric-card" :class="`tone-${tone}`">
    <div class="metric-top"><span>{{ label }}</span><slot name="icon" /></div>
    <strong>{{ formatMoney(value) }}</strong>
    <div class="metric-bottom"><small>{{ hint }}</small><span v-if="change !== undefined" class="change-pill" :class="changeClass"><ArrowUpRight v-if="changeClass === 'up'" :size="14" /><ArrowDownRight v-else-if="changeClass === 'down'" :size="14" /><Minus v-else :size="14" />{{ change === null ? "Жаңа" : `${Math.abs(change || 0)}%` }}</span></div>
  </article>
</template>
