<script setup lang="ts">
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-vue-next";
import type { FinanceIssue } from "../../lib/finance";

defineProps<{ items: Array<{ issue: FinanceIssue; project?: string; color?: string; to?: string }>; empty?: string }>();
const { t } = useLocale();
const icons = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const labels = { critical: "Маңызды", warning: "Назар", info: "Ескерту" };

/**
 * A checklist line whose sentence carries a count: the sentence is translated first, then the number
 * is put in. Translating «43 адамның айлығы төленбеген» as a whole would need one key per count.
 */
function issueText(issue: { text: string; count?: number }): string {
  const sentence = t(issue.text, issue.count);
  return issue.count === undefined ? sentence : sentence.replace("{n}", formatCount(issue.count));
}
</script>

<template>
  <ul v-if="items.length" class="issue-list">
    <li v-for="(item, index) in items" :key="index" :class="`issue-${item.issue.level}`">
      <component :is="icons[item.issue.level]" :size="17" :aria-label="t(labels[item.issue.level])" />
      <div>
        <small v-if="item.project"><i :style="{ background: item.color }" />{{ item.project }}</small>
        <span>{{ issueText(item.issue) }}</span>
      </div>
      <b v-if="item.issue.amount">{{ money(item.issue.amount) }}</b>
      <NuxtLink v-if="item.to" :to="item.to" class="issue-link" :aria-label="`${item.project ?? ''}: ${t('ашу')}`">{{ t("Ашу") }}</NuxtLink>
    </li>
  </ul>
  <div v-else class="issue-empty"><CheckCircle2 :size="20" /><span>{{ empty || t("Бәрі тәртіпте: деректер толық.") }}</span></div>
</template>
