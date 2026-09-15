<script setup lang="ts">
import { CheckCircle2, ChevronDown } from "lucide-vue-next";
import { BANK_LABELS, KIND_LABELS, needsAssignment, sourceOf, type BankOperation, type BankProject } from "../../lib/bank";

/** Operations without a project, grouped by where they come from: one decision per group. */
const props = defineProps<{ operations: BankOperation[]; projects: BankProject[]; colorOf: (id: string) => string }>();
const bank = useBank();
const NONE = "__none";

const groups = computed(() => {
  const map = new Map<string, { key: string; label: string; rule: ReturnType<typeof sourceOf>["rule"]; ops: BankOperation[] }>();
  for (const op of props.operations.filter(needsAssignment)) {
    const source = sourceOf(op);
    const group = map.get(source.key) ?? { ...source, ops: [] };
    group.ops.push(op);
    map.set(source.key, group);
  }
  return [...map.values()].map(g => {
    const sales = g.ops.filter(o => o.kind === "sale" || o.kind === "settlement");
    const dates = g.ops.map(o => o.date).sort();
    const suggested = g.ops.find(o => o.suggestedProjectId)?.suggestedProjectId ?? null;
    const entities = [...new Set(g.ops.map(o => o.legalEntity).filter(Boolean))];
    return { ...g, amount: sales.reduce((a, o) => a + o.amount, 0), from: dates[0]!, to: dates.at(-1)!, suggested, entities, bankName: BANK_LABELS[g.ops[0]!.bank] };
  }).sort((a, b) => b.amount - a.amount);
});

const choice = reactive<Record<string, string>>({});
const remember = reactive<Record<string, boolean>>({});
const open = ref<string | null>(null);
const busy = ref<string | null>(null), error = ref(""), done = ref("");
watch(groups, list => {
  for (const g of list) {
    choice[g.key] ??= g.suggested ?? "";
    remember[g.key] ??= !!g.rule;
  }
}, { immediate: true });

async function apply(g: (typeof groups.value)[number]) {
  const target = choice[g.key];
  if (!target) return;
  busy.value = g.key; error.value = ""; done.value = "";
  try {
    const projectId = target === NONE ? null : target;
    await bank.assignGroup(g.ops.map(o => o.id), projectId, remember[g.key] && g.rule ? g.rule : null);
    const name = projectId ? props.projects.find(p => p.id === projectId)?.name : "«Жобаға қатысы жоқ»";
    done.value = `«${g.label}»: ${g.ops.length} операция → ${name}${remember[g.key] && g.rule ? ". Келесі выпискаларда да осылай бөлінеді." : "."}`;
  } catch (e) {
    error.value = messageOf(e, "Бөлу орындалмады.");
  } finally {
    busy.value = null;
  }
}
const day = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");
</script>

<template>
  <section v-if="groups.length || done" class="panel bank-inbox">
    <header>
      <div><span class="eyebrow">Бөлу керек</span><h2>Жобасы белгісіз операциялар</h2></div>
      <small class="panel-note">Бөлінгенге дейін ешбір жобаның есебіне кірмейді</small>
    </header>
    <p v-if="done" class="bank-done" role="status"><CheckCircle2 :size="16" /> {{ done }}</p>
    <p v-if="error" class="finance-error" role="alert">{{ error }}</p>
    <ul class="bank-inbox-list">
      <li v-for="g in groups" :key="g.key">
        <div class="bank-inbox-source">
          <strong>{{ g.label }}</strong>
          <small>{{ g.bankName }}<template v-if="g.entities.length"> · {{ g.entities.join(", ") }}</template> · {{ day(g.from) }}–{{ day(g.to) }}</small>
          <small v-if="g.suggested" class="bank-suggest">Ұсыныс: {{ projects.find(p => p.id === g.suggested)?.name }} (ереже бекітілмеген)</small>
        </div>
        <div class="bank-inbox-money"><b>{{ money(g.amount) }}</b><small>{{ g.ops.length }} операция</small></div>
        <div class="bank-inbox-action">
          <select v-model="choice[g.key]" :aria-label="`${g.label}: жоба`">
            <option value="" disabled>Жобаны таңдаңыз…</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            <option :value="NONE">Жобаға қатысы жоқ</option>
          </select>
          <button class="button primary" type="button" :disabled="!choice[g.key] || busy === g.key" @click="apply(g)">{{ busy === g.key ? "…" : "Бөлу" }}</button>
          <label v-if="g.rule" class="finance-check"><input v-model="remember[g.key]" type="checkbox"> Келесіде де осылай</label>
        </div>
        <button class="icon-button" type="button" :aria-expanded="open === g.key" aria-label="Операцияларды көру" @click="open = open === g.key ? null : g.key"><ChevronDown :size="16" :class="{ flipped: open === g.key }" /></button>
        <ul v-if="open === g.key" class="bank-inbox-ops">
          <li v-for="o in g.ops.slice(0, 12)" :key="o.id"><span>{{ o.date.split("-").reverse().join(".") }} {{ o.time }}</span><span>{{ KIND_LABELS[o.kind] }} · {{ o.paymentMethod }}</span><b>{{ money(o.amount) }}</b></li>
          <li v-if="g.ops.length > 12" class="muted">және тағы {{ g.ops.length - 12 }} операция</li>
        </ul>
      </li>
    </ul>
  </section>
</template>
