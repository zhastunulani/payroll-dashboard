<script setup lang="ts">
import { counts, detectCity, needsAssignment, summarizeBank, type BankOperation, type BankProject } from "../../lib/bank";

/** The month's actual money per project; a card also filters the list below. */
const props = defineProps<{ operations: BankOperation[]; projects: BankProject[]; colorOf: (id: string) => string; selected: string }>();
const emit = defineEmits<{ select: [project: string] }>();
const WAITING = "__waiting";

const cards = computed(() => props.projects.map(p => {
  const ops = props.operations.filter(o => counts(o) && o.projectId === p.id);
  const sources = [...new Set(ops.map(o => detectCity(o.address) ?? (o.channel.match(/договор\s+(\S+)/)?.[1] ? "Halyk POS" : "")).filter(Boolean))];
  return { ...p, color: props.colorOf(p.id), s: summarizeBank(ops), sources };
}));
const waiting = computed(() => props.operations.filter(needsAssignment));
const waitingSum = computed(() => waiting.value.filter(o => o.kind === "sale" || o.kind === "settlement").reduce((a, o) => a + o.amount, 0));
const total = computed(() => summarizeBank(props.operations.filter(counts)));
</script>

<template>
  <section class="bank-cards" aria-label="Жобалар бойынша нақты түсім">
    <button v-for="c in cards" :key="c.id" type="button" class="panel bank-card" :class="{ active: selected === c.id, empty: !c.s.operations }" :style="{ '--project': c.color }" :aria-pressed="selected === c.id" @click="emit('select', selected === c.id ? 'all' : c.id)">
      <span class="bank-card-name"><i />{{ c.name }}</span>
      <template v-if="c.s.operations">
        <small>Таза түсім</small>
        <strong>{{ money(c.s.afterTax) }}</strong>
        <span class="bank-card-line">Оборот {{ compactMoney(c.s.turnover) }} · {{ c.s.salesCount }} сатылым</span>
        <span class="bank-card-line muted">Комиссия {{ compactMoney(c.s.commission) }}<template v-if="c.s.refunds"> · қайтарым {{ compactMoney(c.s.refunds) }}</template></span>
        <span v-if="c.sources.length" class="bank-card-line cities">{{ c.sources.join(" · ") }}</span>
      </template>
      <template v-else>
        <small>Бұл айда</small>
        <strong class="muted">—</strong>
        <span class="bank-card-line muted">Бөлінген операция жоқ</span>
      </template>
    </button>
    <button type="button" class="panel bank-card waiting" :class="{ active: selected === WAITING, done: !waiting.length }" :aria-pressed="selected === WAITING" @click="emit('select', selected === WAITING ? 'all' : WAITING)">
      <span class="bank-card-name">{{ waiting.length ? "Бөлу керек" : "Барлығы бөлінген" }}</span>
      <small>Ешбір жобаға кірмеген</small>
      <strong>{{ waiting.length }} операция</strong>
      <span class="bank-card-line">{{ money(waitingSum) }}</span>
      <span class="bank-card-line muted">Барлық жоба: {{ compactMoney(total.afterTax) }} таза</span>
    </button>
  </section>
</template>
