<script setup lang="ts">
import { Table2, BarChart3 } from "lucide-vue-next";

type Series = { key: string; label: string; color: string; values: Array<number | null> };
const props = withDefaults(defineProps<{
  labels: string[];
  details?: string[];
  series: Series[];
  line?: { label: string; values: Array<number | null> } | null;
  height?: number;
  format: (value: number | null) => string;
  axisFormat: (value: number) => string;
  caption: string;
  /** Side-by-side bars per series instead of one stacked column, so series are never summed visually. */
  grouped?: boolean;
}>(), { details: () => [], line: null, height: 260, grouped: false });

const root = ref<HTMLElement | null>(null);
const width = ref(640);
const active = ref<number | null>(null);
const tableView = ref(false);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { if (entry) width.value = Math.max(280, Math.round(entry.contentRect.width)); });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const pad = { top: 22, right: 8, bottom: 30, left: 58 };
const plotW = computed(() => width.value - pad.left - pad.right);
const plotH = computed(() => props.height - pad.top - pad.bottom);
const totals = computed(() => props.labels.map((_, i) => {
  const values = props.series.map(s => s.values[i]);
  return values.every(v => v === null || v === undefined) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0);
}));

function niceStep(max: number) {
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(raw)), unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}
const scale = computed(() => {
  const peaks = props.grouped ? props.series.flatMap(s => s.values.map(v => v ?? 0)) : totals.value.map(v => v ?? 0);
  const max = Math.max(1, ...peaks, ...(props.line?.values ?? []).map(v => v ?? 0));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
});
const y = (value: number) => pad.top + plotH.value - (value / scale.value.top) * plotH.value;
const band = computed(() => plotW.value / Math.max(1, props.labels.length));
const barWidth = computed(() => props.grouped
  ? Math.max(3, Math.min(14, (band.value * 0.78 - (props.series.length - 1) * 2) / Math.max(1, props.series.length)))
  : Math.min(24, band.value * 0.5));
const cx = (i: number) => pad.left + band.value * i + band.value / 2;

/** Stacked segments, bottom-up, with a 2px surface gap and a 4px rounded data-end on the top segment only. */
const columns = computed(() => props.labels.map((_, i) => {
  if (props.grouped) {
    const n = props.series.length, groupWidth = n * barWidth.value + (n - 1) * 2;
    const segments = props.series.map((s, index) => {
      const v = s.values[i] ?? 0;
      return { key: s.key, color: s.color, x: cx(i) - groupWidth / 2 + index * (barWidth.value + 2), y: y(v), h: Math.max(0, y(0) - y(v)), top: true };
    }).filter(seg => seg.h > 0);
    return { segments, total: totals.value[i] };
  }
  let base = 0;
  const visible = props.series.map(s => ({ s, v: s.values[i] ?? 0 })).filter(x => x.v > 0);
  const segments = visible.map((x, index) => {
    const y0 = y(base), y1 = y(base + x.v);
    base += x.v;
    const top = index === visible.length - 1;
    const h = Math.max(0, y0 - y1 - (index > 0 ? 2 : 0));
    return { key: x.s.key, color: x.s.color, x: cx(i) - barWidth.value / 2, y: y1, h, top };
  });
  return { segments, total: totals.value[i] };
}));
function segmentPath(seg: { x: number; y: number; h: number; top: boolean }) {
  const w = barWidth.value, r = seg.top ? Math.min(4, seg.h, w / 2) : 0;
  const bottom = seg.y + seg.h;
  return `M${seg.x},${bottom} V${seg.y + r} Q${seg.x},${seg.y} ${seg.x + r},${seg.y} H${seg.x + w - r} Q${seg.x + w},${seg.y} ${seg.x + w},${seg.y + r} V${bottom} Z`;
}
const linePoints = computed(() => (props.line?.values ?? []).map((v, i) => v === null ? null : { x: cx(i), y: y(v), v }));
const linePath = computed(() => {
  let d = "", open = false;
  for (const p of linePoints.value) {
    if (!p) { open = false; continue; }
    d += `${open ? "L" : "M"}${p.x},${p.y} `;
    open = true;
  }
  return d.trim();
});
const lineEnd = computed(() => [...linePoints.value].reverse().find(Boolean) ?? null);
const tooltipStyle = computed(() => {
  if (active.value === null) return {};
  const left = cx(active.value);
  return left > width.value * 0.62 ? { right: `${width.value - left + 16}px` } : { left: `${left + 16}px` };
});
</script>

<template>
  <figure class="chart" :aria-label="caption">
    <div class="chart-top">
      <div class="chart-legend">
        <span v-for="s in series" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }}</span>
        <span v-if="line"><i class="line-key" />{{ line.label }}</span>
      </div>
      <button type="button" class="chart-toggle" :aria-pressed="tableView" @click="tableView = !tableView">
        <component :is="tableView ? BarChart3 : Table2" :size="15" />{{ tableView ? "График" : "Кесте" }}
      </button>
    </div>
    <div v-if="tableView" class="chart-table">
      <table>
        <thead><tr><th>Ай</th><th v-for="s in series" :key="s.key">{{ s.label }}</th><th>Барлығы</th><th v-if="line">{{ line.label }}</th></tr></thead>
        <tbody>
          <tr v-for="(label, i) in labels" :key="label + i">
            <th>{{ details[i] || label }}</th>
            <td v-for="s in series" :key="s.key">{{ format(s.values[i] ?? null) }}</td>
            <td><b>{{ format(totals[i] ?? null) }}</b></td>
            <td v-if="line">{{ format(line.values[i] ?? null) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-show="!tableView" ref="root" class="chart-plot" @mouseleave="active = null">
      <svg :width="width" :height="height" role="img" :aria-label="caption">
        <g class="chart-grid">
          <g v-for="tick in scale.ticks" :key="tick">
            <line :x1="pad.left" :x2="width - pad.right" :y1="y(tick)" :y2="y(tick)" :class="{ baseline: tick === 0 }" />
            <text :x="pad.left - 8" :y="y(tick)" dy="0.32em" text-anchor="end">{{ axisFormat(tick) }}</text>
          </g>
        </g>
        <g v-for="(column, i) in columns" :key="i" :class="{ dim: active !== null && active !== i }">
          <path v-for="seg in column.segments" :key="seg.key" :d="segmentPath(seg)" :fill="seg.color" />
          <text v-if="column.total && !grouped" class="chart-cap" :x="cx(i)" :y="y(column.total) - 7" text-anchor="middle">{{ axisFormat(column.total) }}</text>
          <text v-else-if="!column.total" class="chart-empty" :x="cx(i)" :y="y(0) - 8" text-anchor="middle">{{ band < 64 ? "—" : "дерек жоқ" }}</text>
          <text class="chart-x" :x="cx(i)" :y="height - 9" text-anchor="middle">{{ labels[i] }}</text>
        </g>
        <path v-if="linePath" class="chart-line" :d="linePath" />
        <template v-for="(p, i) in linePoints" :key="`dot-${i}`">
          <circle v-if="p" class="chart-dot" :cx="p.x" :cy="p.y" r="4" />
        </template>
        <text v-if="line && lineEnd" class="chart-line-label" :x="lineEnd.x - 10" :y="lineEnd.y - 10" text-anchor="end">{{ line.label }} {{ axisFormat(lineEnd.v) }}</text>
        <rect
          v-for="(label, i) in labels" :key="`hit-${i}`" class="chart-hit" :x="pad.left + band * i" :y="pad.top" :width="band" :height="plotH"
          tabindex="0" :aria-label="`${details[i] || label}: ${format(totals[i] ?? null)}`"
          @mouseenter="active = i" @focus="active = i" @blur="active = null"
        />
      </svg>
      <div v-if="active !== null" class="chart-tooltip" :style="tooltipStyle" role="status">
        <strong>{{ details[active] || labels[active] }}</strong>
        <span v-for="s in series" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }}<b>{{ format(s.values[active] ?? null) }}</b></span>
        <span class="total">Барлығы<b>{{ format(totals[active] ?? null) }}</b></span>
        <span v-if="line"><i class="line-key" />{{ line.label }}<b>{{ format(line.values[active] ?? null) }}</b></span>
      </div>
    </div>
  </figure>
</template>
