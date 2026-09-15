<script setup lang="ts">
import { TriangleAlert } from "lucide-vue-next";
import { RECON_LABELS, counts, summarizeBank, type BankOperation, type BankProject, type BankReconStatus } from "../../lib/bank";
import type { BankData } from "../../lib/bank-database";

/** Follows the project chosen above; without one, EdUser (the project with a CRM). */
const props = defineProps<{ operations: BankOperation[]; projects: BankProject[]; crm: BankData["crm"]; colorOf: (id: string) => string; selected: string }>();
const bank = useBank();
const project = computed(() => props.projects.some(p => p.id === props.selected) ? props.selected : props.projects.find(p => /^eduser$/i.test(p.name))?.id ?? props.projects[0]?.id ?? "");
const projectName = computed(() => props.projects.find(p => p.id === project.value)?.name ?? "");
const crmOf = (source: string) => props.crm.find(c => c.workspaceId === project.value && c.source === source);
const form = reactive({ amoDeals: null as number | null, amoAmount: null as number | null, crmDeals: null as number | null, crmAmount: null as number | null });
watch([project, () => props.crm], () => {
  Object.assign(form, { amoDeals: crmOf("amocrm")?.deals ?? null, amoAmount: crmOf("amocrm")?.amount ?? null, crmDeals: crmOf("crm_eduser")?.deals ?? null, crmAmount: crmOf("crm_eduser")?.amount ?? null });
}, { immediate: true });
const busy = ref(false), error = ref("");
async function save() {
  busy.value = true; error.value = "";
  try {
    await bank.saveCrm(project.value, "amocrm", form.amoDeals, form.amoAmount);
    await bank.saveCrm(project.value, "crm_eduser", form.crmDeals, form.crmAmount);
  } catch (e) {
    error.value = messageOf(e, "Сақталмады.");
  } finally {
    busy.value = false;
  }
}

const ops = computed(() => props.operations.filter(o => counts(o) && o.projectId === project.value));
const s = computed(() => summarizeBank(ops.value));
const rows = computed(() => [
  { source: "amoCRM", note: "ұтылған (выигранные) сделкалар", deals: crmOf("amocrm")?.deals ?? null, amount: crmOf("amocrm")?.amount ?? null },
  { source: "CRM Eduser", note: "төлемдер", deals: crmOf("crm_eduser")?.deals ?? null, amount: crmOf("crm_eduser")?.amount ?? null },
  { source: "Банк выпискасы", note: "сатылымдар, валовой оборот", deals: s.value.salesCount + s.value.settlementCount, amount: s.value.turnover },
  { source: "Нақты шотқа түскені", note: "Halyk шот выпискасы", deals: s.value.settlementCount || null, amount: s.value.credited },
]);
const diff = (a: number | null | undefined, b: number | null | undefined) => a === null || a === undefined || b === null || b === undefined ? null : a - b;
const reconCounts = computed(() => {
  const map = new Map<BankReconStatus, number>();
  for (const o of props.operations.filter(o => o.projectId === project.value || (o.suggestedProjectId === project.value))) map.set(o.reconStatus, (map.get(o.reconStatus) ?? 0) + 1);
  return [...map.entries()];
});
</script>

<template>
  <div class="bank-crm">
    <h2 class="bank-section-title">CRM-мен салыстыру · {{ projectName }}</h2>
    <p class="bank-warning"><TriangleAlert :size="15" /> Сверка агрегатталған түрде жасалды. Жүйелер арасында ортақ сделка немесе төлем ID-і болмағандықтан, клиенттер бойынша нақты салыстыру мүмкін емес.</p>

    <div class="analytics-columns">
      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">{{ periodLabel(bank.period.value) }}</span><h2>Банк, CRM және amoCRM</h2></div></header>
        <table class="pnl-table detail">
          <thead><tr><th scope="col">Дереккөз</th><th scope="col">Сделка / төлем</th><th scope="col">Сома</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.source"><th scope="row">{{ r.source }}<small class="cell-sub">{{ r.note }}</small></th><td>{{ r.deals ?? "—" }}</td><td>{{ money(r.amount) }}</td></tr>
            <tr class="subtotal"><th scope="row">Банк − amoCRM</th><td>{{ diff(rows[2]!.deals, rows[0]!.deals) ?? "—" }}</td><td>{{ money(diff(rows[2]!.amount, rows[0]!.amount)) }}</td></tr>
            <tr class="subtotal"><th scope="row">Банк − CRM Eduser</th><td>{{ diff(rows[2]!.deals, rows[1]!.deals) ?? "—" }}</td><td>{{ money(diff(rows[2]!.amount, rows[1]!.amount)) }}</td></tr>
          </tbody>
        </table>
        <p class="panel-footnote">CRM сандарын әзірге қолмен енгізесіз. API қосылғанда олар автоматты толады.</p>
      </section>
      <section class="panel analytics-panel">
        <header><div><span class="eyebrow">CRM деректері</span><h2>Айдың сандарын енгізу</h2></div></header>
        <form class="bank-crm-form" @submit.prevent="save">
          <fieldset><legend>amoCRM</legend>
            <label class="form-field"><span>Ұтылған сделка саны</span><input v-model.number="form.amoDeals" type="number" min="0" step="1"></label>
            <label class="form-field"><span>Сомасы, ₸</span><input v-model.number="form.amoAmount" type="number" min="0"></label>
          </fieldset>
          <fieldset><legend>CRM Eduser</legend>
            <label class="form-field"><span>Төлем саны</span><input v-model.number="form.crmDeals" type="number" min="0" step="1"></label>
            <label class="form-field"><span>Сомасы, ₸</span><input v-model.number="form.crmAmount" type="number" min="0"></label>
          </fieldset>
          <button class="button primary" :disabled="busy">{{ busy ? "Сақталуда…" : "Сақтау" }}</button>
          <p v-if="error" class="finance-error" role="alert">{{ error }}</p>
        </form>
        <h3 class="bank-subhead">Операциялар сверка күйі бойынша</h3>
        <ul class="bank-recon-list"><li v-for="[status, n] in reconCounts" :key="status"><span>{{ RECON_LABELS[status] }}</span><b>{{ n }}</b></li><li v-if="!reconCounts.length"><span>Операция жоқ</span></li></ul>
      </section>
    </div>
  </div>
</template>
