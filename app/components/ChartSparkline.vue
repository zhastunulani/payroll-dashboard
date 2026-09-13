<script setup lang="ts">
/** Fluid sparkline: the SVG stretches to its box; the end dot is HTML so it stays round. */
const props = defineProps<{ values: Array<number | null>; color: string }>();
const points = computed(() => {
  const known = props.values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...known), min = Math.min(0, ...known);
  const step = 100 / Math.max(1, props.values.length - 1);
  return props.values.map((v, i) => v === null ? null : { x: step * i, y: 4 + 92 * (1 - (v - min) / (max - min || 1)) });
});
const path = computed(() => {
  let d = "", open = false;
  for (const p of points.value) {
    if (!p) { open = false; continue; }
    d += `${open ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    open = true;
  }
  return d.trim();
});
const last = computed(() => [...points.value].reverse().find(Boolean) ?? null);
</script>

<template>
  <div class="sparkline" aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path :d="path" :stroke="color" vector-effect="non-scaling-stroke" /></svg>
    <i v-if="last" :style="{ left: `${last.x}%`, top: `${last.y}%`, background: color }" />
  </div>
</template>
