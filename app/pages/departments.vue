<script setup lang="ts">
import { Check, CheckCircle2, Clock3, MessageSquareText, Pencil, Plus, Search, Trash2, UserPlus, UsersRound, X } from "lucide-vue-next";
import type { SalaryRecord } from "../../lib/types";

const payroll = usePayroll();
const route = useRoute();
const { formatMoney } = useFormatters();
const { t } = useLocale();

type Status = "all" | "unpaid" | "paid";
// A link to #payment-queue (e.g. «41 адам төленбеген» on the overview) opens the unpaid list.
const status = ref<Status>(route.hash === "#payment-queue" ? "unpaid" : "all");
const departmentFilter = ref("all");
const search = ref("");
const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const editEmployee = ref<SalaryRecord | null>(null);
const editOpen = ref(false);
const noteEmployee = ref<SalaryRecord | null>(null);
const note = ref("");

const departments = computed(() => payroll.data.value?.departments.filter(item => !item.archivedAt || item.employees.length) || []);
const salaries = computed(() => departments.value.flatMap(d => d.employees));
const fund = computed(() => salaries.value.reduce((sum, e) => sum + e.total, 0));
const paid = computed(() => salaries.value.filter(e => e.isPaid).reduce((sum, e) => sum + e.total, 0));
const unpaidPeople = computed(() => salaries.value.filter(e => !e.isPaid && e.total > 0));
const paidPeople = computed(() => salaries.value.filter(e => e.isPaid));
const staffed = computed(() => salaries.value.filter(e => e.total > 0));
const progress = computed(() => fund.value > 0 ? paid.value / fund.value : 0);
// Advances were handed out during the month and are already deducted from these amounts.
const advances = computed(() => salaries.value.flatMap(e => e.components).filter(c => c.kind === "deduction" && /аванс/i.test(c.name)).reduce((sum, c) => sum + c.amount, 0));
const byMethod = computed(() => {
  const map = new Map<string, { name: string; total: number; unpaid: number }>();
  for (const e of salaries.value) {
    const item = map.get(e.paymentMethodName) ?? { name: e.paymentMethodName, total: 0, unpaid: 0 };
    item.total += e.total;
    if (!e.isPaid) item.unpaid += e.total;
    map.set(e.paymentMethodName, item);
  }
  return [...map.values()].filter(m => m.total > 0).sort((a, b) => b.total - a.total);
});

const matches = (e: SalaryRecord) => {
  const query = search.value.trim().toLocaleLowerCase("kk-KZ");
  if (status.value === "unpaid" && (e.isPaid || e.total <= 0)) return false;
  if (status.value === "paid" && !e.isPaid) return false;
  return !query || `${e.employeeName} ${e.position} ${e.paymentMethodName}`.toLocaleLowerCase("kk-KZ").includes(query);
};
/** Departments with their visible people; unpaid first, so the payment work is at the top. */
const groups = computed(() => departments.value
  .filter(d => departmentFilter.value === "all" || d.id === departmentFilter.value)
  .map(d => ({
    ...d,
    rows: d.employees.filter(matches).sort((a, b) => Number(a.isPaid) - Number(b.isPaid) || b.total - a.total),
    unpaidRows: d.employees.filter(e => !e.isPaid && e.total > 0),
  }))
  .filter(d => d.rows.length || (departmentFilter.value !== "all" && !search.value && status.value === "all")));
const visibleIds = computed(() => groups.value.flatMap(g => g.rows.map(e => e.id)));
const selected = computed(() => salaries.value.filter(e => selectedIds.value.has(e.id)));
const allSelected = computed(() => !!visibleIds.value.length && visibleIds.value.every(id => selectedIds.value.has(id)));

function toggle(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}
function toggleAll() {
  selectionMode.value = true;
  selectedIds.value = allSelected.value ? new Set() : new Set(visibleIds.value);
}
function closeSelection() { selectionMode.value = false; selectedIds.value = new Set(); }
async function setPaidBulk(value: boolean) {
  if (await payroll.mutate("setSalaryPaidBulk", { ids: selected.value.map(item => item.id), isPaid: value })) closeSelection();
}
async function payDepartment(group: { name: string; unpaidRows: SalaryRecord[] }) {
  const sum = group.unpaidRows.reduce((a, e) => a + e.total, 0);
  if (!confirm(`${group.name}: ${group.unpaidRows.length} ${t("адамға")} ${formatMoney(sum)} ${t("төленді деп белгіленсін бе?")}`)) return;
  await payroll.mutate("setSalaryPaidBulk", { ids: group.unpaidRows.map(e => e.id), isPaid: true });
}
async function deleteBulk() {
  if (!selected.value.length || !confirm(`${selected.value.length} ${t("қызметкер және олардың барлық айлық есептері толық өшіріледі. Жалғастыру керек пе?")}`)) return;
  if (await payroll.mutate("deleteEmployeesBulk", { employeeIds: selected.value.map(item => item.employeeId) })) closeSelection();
}
function openEdit(employee: SalaryRecord | null) { editEmployee.value = employee; editOpen.value = true; }
function openNote(employee: SalaryRecord) { noteEmployee.value = employee; note.value = employee.note; }
async function saveNote() {
  if (noteEmployee.value && await payroll.mutate("saveEmployeeNote", { id: noteEmployee.value.id, note: note.value })) noteEmployee.value = null;
}
async function remove(employee: SalaryRecord) {
  if (confirm(`${employee.employeeName} ${t("және оның барлық айлардағы есебі толық өшіріледі. Жалғастыру керек пе?")}`)) await payroll.mutate("deleteEmployee", { employeeId: employee.employeeId });
}
</script>

<template>
  <div v-if="payroll.data.value" class="page salary-page">
    <section class="panel pay-summary">
      <div class="pay-summary-main">
        <span class="eyebrow">{{ t("Айлық қоры") }} · {{ monthName(payroll.data.value.selectedMonth) }}</span>
        <strong>{{ formatMoney(fund) }}</strong>
        <div class="pay-progress" role="img" :aria-label="`${t('Төленді')} ${Math.round(progress * 100)}%`"><i :style="{ width: `${progress * 100}%` }" /></div>
        <div class="pay-legend">
          <button type="button" class="paid" :class="{ active: status === 'paid' }" @click="status = 'paid'"><i />{{ t("Төленді") }} <b>{{ formatMoney(paid) }}</b><small>{{ paidPeople.length }} {{ t("адам") }}</small></button>
          <button type="button" class="left" :class="{ active: status === 'unpaid' }" @click="status = 'unpaid'"><i />{{ t("Төлеу керек") }} <b>{{ formatMoney(fund - paid) }}</b><small>{{ unpaidPeople.length }} {{ t("адам") }}</small></button>
        </div>
        <small v-if="advances" class="pay-advance">{{ t("Бұған қоса аванс бұрын берілген:") }} <b>{{ formatMoney(advances) }}</b> {{ t("— айлықтан шегерілді. Есептерде ФОТ =") }} {{ formatMoney(fund + advances) }}.</small>
      </div>
      <div class="pay-summary-side">
        <div><small>{{ t("Қызметкер") }}</small><strong>{{ staffed.length }}</strong></div>
        <div><small>{{ t("Бөлім") }}</small><strong>{{ departments.length }}</strong></div>
        <div><small>{{ t("Орташа айлық") }}</small><strong>{{ formatMoney(staffed.length ? fund / staffed.length : 0) }}</strong></div>
        <ul v-if="byMethod.length" class="pay-methods">
          <li v-for="m in byMethod" :key="m.name"><span>{{ m.name }}</span><b>{{ formatMoney(m.total) }}</b><small v-if="m.unpaid">{{ t("қалды") }} {{ formatMoney(m.unpaid) }}</small></li>
        </ul>
      </div>
    </section>

    <section class="panel pay-toolbar">
      <div class="pay-toolbar-row">
        <div class="segmented pay-status" role="group" :aria-label="t('Төлем күйі')">
          <button type="button" :class="{ active: status === 'all' }" @click="status = 'all'">{{ t("Барлығы") }} <b>{{ salaries.length }}</b></button>
          <button type="button" :class="{ active: status === 'unpaid' }" @click="status = 'unpaid'">{{ t("Төленбеген") }} <b>{{ unpaidPeople.length }}</b></button>
          <button type="button" :class="{ active: status === 'paid' }" @click="status = 'paid'">{{ t("Төленген") }} <b>{{ paidPeople.length }}</b></button>
        </div>
        <label class="search-field"><Search :size="17" /><input v-model="search" :placeholder="t('Аты, лауазымы немесе төлем түрі')" /></label>
        <button v-if="!selectionMode" class="button subtle" type="button" @click="toggleAll"><CheckCircle2 :size="16" /> {{ t("Таңдау") }}</button>
        <button class="button primary" type="button" @click="openEdit(null)"><UserPlus :size="17" /> {{ t("Қызметкер") }}</button>
      </div>
      <div class="dept-chips" role="group" :aria-label="t('Бөлім')">
        <button type="button" :class="{ active: departmentFilter === 'all' }" @click="departmentFilter = 'all'">{{ t("Барлық бөлім") }}</button>
        <button v-for="d in departments" :key="d.id" type="button" :class="{ active: departmentFilter === d.id }" @click="departmentFilter = d.id">
          {{ d.name }} <b>{{ d.employees.length }}</b><i v-if="d.remaining > 0" class="dot-owed" :title="t('Төленбеген бар')" />
        </button>
      </div>
    </section>

    <div v-if="selectionMode" class="selection-bar active pay-selection">
      <div><label><input type="checkbox" :checked="allSelected" @change="toggleAll" /> {{ allSelected ? t("Барлығы таңдалды") : t("Көрінгеннің барлығын таңдау") }}</label><button type="button" @click="closeSelection"><X :size="15" /> {{ t("Аяқтау") }}</button></div>
      <div v-if="selected.length"><strong>{{ selected.length }} {{ t("таңдалды") }}</strong><button type="button" @click="setPaidBulk(true)"><CheckCircle2 :size="15" /> {{ t("Төленді") }}</button><button type="button" @click="setPaidBulk(false)"><Clock3 :size="15" /> {{ t("Төленбеді") }}</button><button type="button" class="danger" @click="deleteBulk"><Trash2 :size="15" /> {{ t("Өшіру") }}</button></div>
      <span v-else>{{ t("Қызметкерлерді белгілеңіз") }}</span>
    </div>

    <section id="payment-queue" class="pay-groups">
      <article v-for="group in groups" :key="group.id" class="panel pay-group">
        <header>
          <div class="pay-group-title"><h3>{{ group.name }}</h3><small>{{ group.employees.length }} {{ t("адам") }} · {{ group.employees.length - group.unpaidRows.length }} {{ t("төленді") }}</small></div>
          <div class="pay-group-money">
            <b>{{ formatMoney(group.total) }}</b>
            <span class="meter"><i :style="{ width: `${group.total ? group.paid / group.total * 100 : 0}%` }" /></span>
            <small v-if="group.remaining" class="owed">{{ t("қалды") }} {{ formatMoney(group.remaining) }}</small>
            <small v-else-if="group.total" class="done">{{ t("толық төленді") }}</small>
          </div>
          <button v-if="group.unpaidRows.length" class="button secondary pay-all" type="button" :disabled="payroll.saving.value" @click="payDepartment(group)"><CheckCircle2 :size="16" /> {{ t("Бөлімді төлеу") }}</button>
        </header>
        <div v-if="group.rows.length" class="pay-rows">
          <div v-for="employee in group.rows" :key="employee.id" class="pay-row" :class="{ paid: employee.isPaid, selected: selectedIds.has(employee.id), selecting: selectionMode }">
            <label v-if="selectionMode" class="row-check"><input type="checkbox" :checked="selectedIds.has(employee.id)" @change="toggle(employee.id)" /></label>
            <div class="person"><i>{{ employee.employeeName.slice(0, 1).toUpperCase() }}</i><span><strong>{{ employee.employeeName }}</strong><small>{{ employee.position || t("Лауазым көрсетілмеген") }}</small></span></div>
            <span class="tag">{{ employee.paymentMethodName }}</span>
            <div class="pay-breakdown">
              <small>{{ t("Негізгі") }} {{ formatMoney(employee.baseSalary) }}</small>
              <small v-for="component in employee.components" :key="component.id" :class="component.kind">{{ component.kind === "deduction" ? "−" : "+" }} {{ component.name }} {{ formatMoney(component.amount) }}</small>
            </div>
            <button type="button" class="note-button" :class="{ filled: employee.note }" @click="openNote(employee)"><MessageSquareText :size="15" /><span>{{ employee.note || t("Пікір қосу") }}</span></button>
            <strong class="pay-amount">{{ formatMoney(employee.total) }}</strong>
            <button type="button" class="status-toggle pay-toggle" :class="{ paid: employee.isPaid }" :disabled="payroll.isPending('toggleSalaryPaid', employee.id)" @click="payroll.mutate('toggleSalaryPaid', { id: employee.id, isPaid: !employee.isPaid })"><i><Check v-if="employee.isPaid" :size="13" /></i>{{ employee.isPaid ? t("Төленді") : t("Төлеу") }}</button>
            <div class="row-actions"><button type="button" :aria-label="t('Өзгерту')" @click="openEdit(employee)"><Pencil :size="16" /></button><button type="button" class="danger" :aria-label="t('Өшіру')" @click="remove(employee)"><Trash2 :size="16" /></button></div>
          </div>
        </div>
        <div v-else class="pay-empty-group"><span>{{ t("Бұл бөлімде қызметкер жоқ.") }}</span><button type="button" class="text-button" @click="openEdit(null)"><Plus :size="14" /> {{ t("Қосу") }}</button></div>
      </article>
      <div v-if="!groups.length" class="panel empty-state">
        <span><UsersRound :size="25" /></span>
        <strong>{{ status === "unpaid" ? t("Барлық айлық төленді") : t("Сүзгі бойынша ешкім табылмады") }}</strong>
        <p>{{ status === "unpaid" ? t("Бұл айда төленбеген қызметкер қалған жоқ.") : t("Басқа бөлімді немесе күйді таңдап көріңіз.") }}</p>
        <button v-if="status !== 'all' || search" class="button secondary" type="button" @click="status = 'all'; search = ''; departmentFilter = 'all'">{{ t("Барлығын көрсету") }}</button>
      </div>
    </section>
  </div>

  <EmployeeForm v-if="editOpen" :employee="editEmployee" :default-department="departmentFilter === 'all' ? undefined : departmentFilter" @close="editOpen = false" @saved="editOpen = false" />
  <UiModal v-if="noteEmployee" :title="t('Қызметкер пікірі')" :description="noteEmployee.employeeName" @close="noteEmployee = null">
    <form class="form-stack" @submit.prevent="saveNote"><label class="form-field"><span>{{ t("Пікір немесе ескерту") }}</span><textarea v-model="note" maxlength="600" rows="5" :placeholder="t('Мысалы: 50% берілді')" /></label><div class="modal-actions"><button type="button" class="button ghost" @click="noteEmployee = null">{{ t("Болдырмау") }}</button><button class="button primary" :disabled="payroll.isPending('saveEmployeeNote', noteEmployee.id)">{{ payroll.isPending('saveEmployeeNote', noteEmployee.id) ? t("Сақталуда…") : t("Сақтау") }}</button></div></form>
  </UiModal>
</template>
