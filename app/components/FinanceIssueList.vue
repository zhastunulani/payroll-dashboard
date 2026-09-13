<script setup lang="ts">
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-vue-next";
import type { FinanceIssue } from "../../lib/finance";

defineProps<{ items: Array<{ issue: FinanceIssue; project?: string; color?: string; to?: string }>; empty?: string }>();
const icons = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const labels = { critical: "Маңызды", warning: "Назар", info: "Ескерту" };
</script>

<template>
  <ul v-if="items.length" class="issue-list">
    <li v-for="(item, index) in items" :key="index" :class="`issue-${item.issue.level}`">
      <component :is="icons[item.issue.level]" :size="17" :aria-label="labels[item.issue.level]" />
      <div>
        <small v-if="item.project"><i :style="{ background: item.color }" />{{ item.project }}</small>
        <span>{{ item.issue.text }}</span>
      </div>
      <b v-if="item.issue.amount">{{ money(item.issue.amount) }}</b>
      <NuxtLink v-if="item.to" :to="item.to" class="issue-link" :aria-label="`${item.project ?? ''}: ашу`">Ашу</NuxtLink>
    </li>
  </ul>
  <div v-else class="issue-empty"><CheckCircle2 :size="20" /><span>{{ empty || "Бәрі тәртіпте: деректер толық." }}</span></div>
</template>
