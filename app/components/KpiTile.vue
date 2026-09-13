<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-vue-next";

const props = withDefaults(defineProps<{
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  goodWhen?: "up" | "down" | "neutral";
  tone?: "default" | "brand" | "success" | "danger";
}>(), { sub: "", delta: undefined, goodWhen: "down", tone: "default" });

const direction = computed(() => props.delta === null || props.delta === undefined || Math.abs(props.delta) < 0.0005 ? "flat" : props.delta > 0 ? "up" : "down");
const quality = computed(() => direction.value === "flat" || props.goodWhen === "neutral" ? "neutral" : direction.value === props.goodWhen ? "good" : "bad");
const deltaText = computed(() => props.delta === null || props.delta === undefined ? "" : formatDelta(props.delta));
</script>

<template>
  <article class="kpi-tile" :class="`tone-${tone}`">
    <div class="kpi-head">
      <span class="kpi-label">{{ label }}</span>
      <span v-if="delta !== undefined && delta !== null" class="kpi-delta" :class="quality" title="Өткен аймен салыстырғанда">
        <ArrowUpRight v-if="direction === 'up'" :size="13" /><ArrowDownRight v-else-if="direction === 'down'" :size="13" /><Minus v-else :size="13" />{{ deltaText }}
      </span>
    </div>
    <strong class="kpi-value">{{ value }}</strong>
    <small class="kpi-sub">{{ sub }}</small>
  </article>
</template>
