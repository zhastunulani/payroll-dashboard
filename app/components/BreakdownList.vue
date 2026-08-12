<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight } from "lucide-vue-next";
import type { BreakdownItem } from "../../lib/types";

const props = defineProps<{ items: BreakdownItem[]; limit?: number; empty?: string }>();
const { formatMoney } = useFormatters();
const shown = computed(() => props.items.slice(0, props.limit || props.items.length));
const max = computed(() => Math.max(...shown.value.map(item => item.amount), 1));
</script>

<template>
  <div v-if="shown.length" class="breakdown-list">
    <div v-for="item in shown" :key="item.id" class="breakdown-row">
      <div class="breakdown-meta"><strong>{{ item.name }}</strong><span>{{ formatMoney(item.amount) }}</span></div>
      <div class="breakdown-track"><i :style="{ width: `${Math.max(2, item.amount / max * 100)}%` }" /></div>
      <small v-if="item.change !== 0" :class="item.change > 0 ? 'negative-change' : 'positive-change'"><ArrowUpRight v-if="item.change > 0" :size="13" /><ArrowDownRight v-else :size="13" />{{ item.change > 0 ? "+" : "−" }}{{ formatMoney(Math.abs(item.change)) }}</small>
      <small v-else class="muted-change">Өзгеріс жоқ</small>
    </div>
  </div>
  <div v-else class="empty-compact">{{ empty || "Дерек жоқ" }}</div>
</template>
