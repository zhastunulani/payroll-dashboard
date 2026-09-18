<script setup lang="ts">
import { Pencil, RefreshCw, Trash2 } from "lucide-vue-next";
import { CITIES, RULE_FIELD_LABELS, cityRuleId, defaultCityProject, detectCity, foldText, type BankOperation, type BankProject, type BankRule, type BankRuleField } from "../../lib/bank";

const props = defineProps<{ rules: BankRule[]; projects: BankProject[]; operations: BankOperation[]; colorOf: (id: string) => string }>();
const bank = useBank();
const { t } = useLocale();
const draft = useState<Partial<BankRule> | null>("bank:rule-draft", () => null);
const NONE = "__none";
const empty = () => ({ id: "", field: "address" as BankRuleField, pattern: "", project: "", approved: true, priority: 500, note: "" });
const form = reactive(empty());
const busy = ref(false), error = ref(""), done = ref("");

// A rule suggested from an operation («Осыдан ереже жасау») fills the form.
watch(draft, value => {
  if (!value) return;
  Object.assign(form, empty(), { field: value.field ?? "address", pattern: value.pattern ?? "", project: value.projectId ?? "", approved: value.approved ?? true });
  draft.value = null;
  nextTick(() => document.getElementById("bank-rule-form")?.scrollIntoView({ behavior: "smooth", block: "center" }));
}, { immediate: true });

const ownerRules = computed(() => props.rules.filter(r => !r.builtin && r.field !== "city"));
const builtin = computed(() => props.rules.filter(r => r.builtin && r.field !== "city"));
const fieldOptions = Object.entries(RULE_FIELD_LABELS).filter(([key]) => key !== "city");

// Cities: the default comes from the project names (Тараз → «Тараз Едусер», Астана → the main project);
// the owner can move any city to another project or mark it «not a project».
const cityRows = computed(() => {
  const seen = new Map<string, { count: number; amount: number }>();
  for (const o of props.operations) {
    const city = detectCity(o.address);
    if (!city) continue;
    const row = seen.get(city) ?? { count: 0, amount: 0 };
    row.count += 1;
    if (o.kind === "sale" || o.kind === "settlement") row.amount += o.amount;
    seen.set(city, row);
  }
  return CITIES.map(c => {
    const owned = props.rules.find(r => r.field === "city" && !r.builtin && foldText(r.pattern) === foldText(c.name));
    const fallback = defaultCityProject(c.name, props.projects);
    return { city: c.name, ...(seen.get(c.name) ?? { count: 0, amount: 0 }), owned, fallback, value: owned ? owned.projectId ?? NONE : fallback ?? "" };
  }).filter(r => r.count || r.owned || r.fallback);
});
const noCity = computed(() => {
  const map = new Map<string, number>();
  for (const o of props.operations) if (o.address && !detectCity(o.address)) map.set(o.address, (map.get(o.address) ?? 0) + 1);
  return [...map.entries()];
});
async function setCity(city: string, value: string) {
  busy.value = true; error.value = ""; done.value = "";
  try {
    const result = await bank.saveRule({ id: cityRuleId(city), field: "city", pattern: city, projectId: value === NONE ? null : value || null, approved: true, priority: 50, note: "Қала бойынша" });
    done.value = `${city}: ${t("сақталды")}. ${result.changed ?? 0} ${t("операция қайта бөлінді")}.`;
  } catch (e) {
    error.value = messageOf(e, t("Сақталмады."));
  } finally {
    busy.value = false;
  }
}
async function resetCity(rule: BankRule) {
  busy.value = true;
  try { const r = await bank.deleteRule(rule.id); done.value = `${rule.pattern}: ${t("автоматты бөлуге қайтарылды")}. ${r.changed ?? 0} ${t("операция қайта бөлінді")}.`; } catch (e) { error.value = messageOf(e, t("Орындалмады.")); } finally { busy.value = false; }
}
const projectName = (id: string | null) => id ? props.projects.find(p => p.id === id)?.name ?? "—" : t("Жобаға қатысы жоқ");
const tamshy = computed(() => props.projects.find(p => /tamshy|тамшы/i.test(p.name)));

function edit(rule: BankRule) {
  Object.assign(form, { id: rule.id, field: rule.field, pattern: rule.pattern, project: rule.projectId ?? NONE, approved: rule.approved, priority: rule.priority, note: rule.note });
}
async function save() {
  if (!form.project) { error.value = t("Жобаны немесе «Жобаға қатысы жоқ» дегенді таңдаңыз."); return; }
  busy.value = true; error.value = ""; done.value = "";
  try {
    const result = await bank.saveRule({ id: form.id || undefined, field: form.field, pattern: form.pattern, projectId: form.project === NONE ? null : form.project, approved: form.approved, priority: form.priority, note: form.note });
    done.value = `${t("Ереже сақталды")}. ${result.changed ?? 0} ${t("операция қайта бөлінді")}.`;
    Object.assign(form, empty());
  } catch (e) {
    error.value = messageOf(e, t("Ереже сақталмады."));
  } finally {
    busy.value = false;
  }
}
async function remove(rule: BankRule) {
  if (!confirm(t("«{p}» ережесі өшірілсін бе? Операциялар қалған ережелер бойынша қайта бөлінеді.").replace("{p}", rule.pattern))) return;
  busy.value = true;
  try { const r = await bank.deleteRule(rule.id); done.value = `${t("Ереже өшірілді")}. ${r.changed ?? 0} ${t("операция қайта бөлінді")}.`; } catch (e) { error.value = messageOf(e, t("Өшірілмеді.")); } finally { busy.value = false; }
}
async function reapply() {
  busy.value = true;
  try { const r = await bank.applyRules(); done.value = `${r.changed ?? 0} ${t("операция қайта бөлінді")}.`; } catch (e) { error.value = messageOf(e, t("Орындалмады.")); } finally { busy.value = false; }
}
</script>

<template>
  <div class="bank-rules">
    <p v-if="tamshy" class="bank-warning"><span>
      <b>{{ tamshy.name }}:</b> {{ t("төлемдері басқа төлемдермен аралас, сондықтан оның жүйелік ережесі") }} <b>{{ t("бекітілмеген") }}</b>.
      {{ t("Сәйкес операциялар «Жоба анықталмады» күйінде қалады және {p} есебіне өздігінен кірмейді.").replace("{p}", tamshy.name) }}
      {{ t("Нақты белгі (мекенжай, шарт, мақсат) белгілі болғанда өз ережеңізді қосып, «Бекітілген» деп белгілеңіз.") }}
    </span></p>

    <section class="panel analytics-panel bank-cities">
      <header><div><span class="eyebrow">{{ t("Негізгі бөлу") }}</span><h2>{{ t("Қалалар бойынша") }}</h2></div><small class="panel-note">{{ t("Сауда нүктесінің мекенжайындағы қала жобаны анықтайды") }}</small></header>
      <table class="pnl-table detail">
        <thead><tr><th scope="col">{{ t("Қала") }}</th><th scope="col">{{ t("Осы айда") }}</th><th scope="col">{{ t("Жоба") }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="r in cityRows" :key="r.city">
            <th scope="row">{{ r.city }}</th>
            <td>{{ r.count }} {{ t("операция") }} · {{ money(r.amount) }}</td>
            <td>
              <select class="project-select" :value="r.value" :disabled="busy" :aria-label="`${r.city}: ${t('жоба')}`" @change="setCity(r.city, ($event.target as HTMLSelectElement).value)">
                <option value="" disabled>{{ t("Жобаны таңдаңыз…") }}</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                <option :value="NONE">{{ t("Жобаға қатысы жоқ") }}</option>
              </select>
              <small class="cell-sub">{{ r.owned ? t("сіз таңдағансыз") : r.fallback ? t("автоматты: жоба атауы бойынша") : t("жоба табылмады — таңдаңыз") }}</small>
            </td>
            <td><button v-if="r.owned" class="text-button" type="button" :disabled="busy" @click="resetCity(r.owned!)">{{ t("Автоматтыға қайтару") }}</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="noCity.length" class="bank-warning">{{ t("Қаласы анықталмаған мекенжайлар") }}: <template v-for="([address, n], i) in noCity" :key="address">{{ i ? "; " : "" }}«{{ address }}» ({{ n }})</template>. {{ t("Оларды «Бөлу керек» тізімінен бөліңіз.") }}</p>
    </section>

    <section id="bank-rule-form" class="panel analytics-panel">
      <header><div><span class="eyebrow">{{ t("Ерекше жағдайлар") }}</span><h2>{{ form.id ? t("Ережені өзгерту") : t("Нақты мекенжай, шарт немесе контрагент бойынша ереже") }}</h2></div><button class="button secondary" type="button" :disabled="busy" @click="reapply"><RefreshCw :size="15" /> {{ t("Ережелерді қайта қолдану") }}</button></header>
      <form class="bank-rule-form" @submit.prevent="save">
        <label class="form-field"><span>{{ t("Қай өрістен іздеу") }}</span><select v-model="form.field"><option v-for="[key, label] in fieldOptions" :key="key" :value="key">{{ t(label) }}</option></select></label>
        <label class="form-field grow"><span>{{ t("Мәтін (кіші-үлкен әріп, «ұ/у» айырмасы есепке алынбайды)") }}</span><input v-model="form.pattern" required minlength="2" maxlength="200" :placeholder="t('Мысалы: Керей, Жәнібек хандар немесе 687212-28/11/24')"></label>
        <label class="form-field"><span>{{ t("Жоба") }}</span><select v-model="form.project" required><option value="" disabled>{{ t("Таңдаңыз…") }}</option><option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option><option :value="NONE">{{ t("Жобаға қатысы жоқ") }}</option></select></label>
        <label class="form-field narrow"><span>{{ t("Басымдық") }}</span><input v-model.number="form.priority" type="number" min="1" max="9999"></label>
        <label class="finance-check approve"><input v-model="form.approved" type="checkbox"> {{ t("Бекітілген — жобаға өздігінен қосады") }}<small v-if="!form.approved">{{ t("Бекітілмеген ереже тек ұсыныс береді: операция тексеруге түседі") }}</small></label>
        <label class="form-field grow"><span>{{ t("Ескерту") }}</span><input v-model="form.note" maxlength="300" :placeholder="t('Неге осылай бөлінеді')"></label>
        <div class="ledger-actions"><button class="button primary" :disabled="busy">{{ busy ? t("Сақталуда…") : t("Сақтау және қолдану") }}</button><button v-if="form.id || form.pattern" class="button ghost" type="button" @click="Object.assign(form, empty())">{{ t("Тазалау") }}</button></div>
      </form>
      <p v-if="error" class="finance-error" role="alert">{{ error }}</p>
      <p v-if="done" class="bank-done" role="status">{{ done }}</p>
    </section>

    <section class="panel analytics-panel">
      <header><div><span class="eyebrow">{{ t("Тәртіп") }}</span><h2>{{ t("Бөлу ережелері") }}</h2></div><small class="panel-note">{{ t("Тәртіп: сіздің нақты ережелеріңіз → Тамшылаб сақтығы → қала") }}</small></header>
      <div class="table-scroll">
        <table class="pnl-table detail bank-rule-table">
          <thead><tr><th scope="col">{{ t("Өріс") }}</th><th scope="col">{{ t("Мәтін") }}</th><th scope="col">{{ t("Жоба") }}</th><th scope="col">{{ t("Күйі") }}</th><th scope="col">{{ t("Басымдық") }}</th><th scope="col">{{ t("Ескерту") }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in ownerRules" :key="r.id">
              <td>{{ t(RULE_FIELD_LABELS[r.field]) }}</td><th scope="row">{{ r.pattern }}</th>
              <td><i v-if="r.projectId" class="group-dot" :style="{ background: colorOf(r.projectId) }" />{{ projectName(r.projectId) }}</td>
              <td><span class="bank-state" :class="r.approved ? 'auto' : 'unknown'">{{ r.approved ? t("Бекітілген") : t("Тек ұсыныс") }}</span></td>
              <td>{{ r.priority }}</td><td class="muted">{{ r.note }}</td>
              <td class="row-actions"><button type="button" :aria-label="t('Өзгерту')" @click="edit(r)"><Pencil :size="15" /></button><button type="button" class="danger" :aria-label="t('Өшіру')" @click="remove(r)"><Trash2 :size="15" /></button></td>
            </tr>
            <tr v-if="!ownerRules.length"><td colspan="7" class="panel-empty">{{ t("Әзірге өз ережеңіз жоқ.") }}</td></tr>
            <tr v-for="r in builtin" :key="r.id" class="muted-row">
              <td>{{ t(RULE_FIELD_LABELS[r.field]) }}</td><th scope="row">{{ r.pattern }}</th>
              <td><i v-if="r.projectId" class="group-dot" :style="{ background: colorOf(r.projectId) }" />{{ projectName(r.projectId) }}</td>
              <td><span class="bank-state" :class="r.approved ? 'auto' : 'unknown'">{{ r.approved ? t("Жүйелік") : t("Жүйелік · тек ұсыныс") }}</span></td>
              <td>—</td><td class="muted">{{ r.note }}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
