<script setup lang="ts">
import { Check, CheckCircle2, Clock3, MessageSquareText, Pencil, Search, Trash2, UsersRound, X } from "lucide-vue-next";
import type { SalaryRecord } from "../../lib/types";

const payroll = usePayroll();
const { formatMoney } = useFormatters();
const selectedDepartment = ref("");
const search = ref("");
const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const editEmployee = ref<SalaryRecord | null>(null);
const editOpen = ref(false);
const noteEmployee = ref<SalaryRecord | null>(null);
const note = ref("");

const departments = computed(() => payroll.data.value?.departments.filter(item => !item.archivedAt) || []);
watch(departments, list => {
  if (!list.some(item => item.id === selectedDepartment.value)) selectedDepartment.value = list[0]?.id || "";
}, { immediate: true });
const department = computed(() => departments.value.find(item => item.id === selectedDepartment.value));
const employees = computed(() => {
  const query = search.value.trim().toLocaleLowerCase("kk-KZ");
  const rows = department.value?.employees || [];
  return query ? rows.filter(item => `${item.employeeName} ${item.position} ${item.paymentMethodName}`.toLocaleLowerCase("kk-KZ").includes(query)) : rows;
});
const departmentOptions = computed(() => departments.value.map(item => ({ value: item.id, label: item.name, description: `${item.employees.length} қызметкер` })));
const selected = computed(() => department.value?.employees.filter(item => selectedIds.value.has(item.id)) || []);
const allSelected = computed(() => !!department.value?.employees.length && department.value.employees.every(item => selectedIds.value.has(item.id)));

function selectDepartment(value: string) {
  selectedDepartment.value = value;
  selectionMode.value = false;
  selectedIds.value = new Set();
}
function toggle(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}
function toggleAll() {
  selectionMode.value = true;
  selectedIds.value = allSelected.value ? new Set() : new Set(department.value?.employees.map(item => item.id) || []);
}
function closeSelection() { selectionMode.value = false; selectedIds.value = new Set(); }
async function setPaidBulk(value: boolean) {
  if (await payroll.mutate("setSalaryPaidBulk", { ids: selected.value.map(item => item.id), isPaid: value })) closeSelection();
}
async function deleteBulk() {
  if (!selected.value.length || !confirm(`${selected.value.length} қызметкер және олардың барлық айлық есептері толық өшіріледі. Жалғастыру керек пе?`)) return;
  if (await payroll.mutate("deleteEmployeesBulk", { employeeIds: selected.value.map(item => item.employeeId) })) closeSelection();
}
function openEdit(employee: SalaryRecord) { editEmployee.value = employee; editOpen.value = true; }
function openNote(employee: SalaryRecord) { noteEmployee.value = employee; note.value = employee.note; }
async function saveNote() {
  if (noteEmployee.value && await payroll.mutate("saveEmployeeNote", { id: noteEmployee.value.id, note: note.value })) noteEmployee.value = null;
}
async function remove(employee: SalaryRecord) {
  if (confirm(`${employee.employeeName} және оның барлық айлардағы есебі толық өшіріледі. Жалғастыру керек пе?`)) await payroll.mutate("deleteEmployee", { employeeId: employee.employeeId });
}
</script>

<template>
  <div v-if="department" class="page departments-page">
    <section class="department-picker panel">
      <div class="desktop-department-tabs"><button v-for="item in departments" :key="item.id" type="button" :class="{ active: item.id === selectedDepartment }" @click="selectDepartment(item.id)"><span>{{ item.name }}</span><b>{{ item.employees.length }}</b></button></div>
      <div class="mobile-department-select"><UiSmartSelect :model-value="selectedDepartment" :options="departmentOptions" label="Бөлім" search-placeholder="Бөлімді іздеу" @update:model-value="selectDepartment" /></div>
    </section>

    <section class="department-kpis">
      <div><span>Айлық қоры</span><strong>{{ formatMoney(department.total) }}</strong></div>
      <div class="success"><span>Төленген</span><strong>{{ formatMoney(department.paid) }}</strong></div>
      <div class="brand"><span>Қалғаны</span><strong>{{ formatMoney(department.remaining) }}</strong></div>
      <div><span>Қызметкерлер</span><strong>{{ department.employees.length }}</strong></div>
    </section>

    <section class="panel table-panel">
      <header class="table-toolbar"><div><span class="eyebrow">Қызметкерлер</span><h2>{{ department.name }}</h2><p>Айлық сомасы мен төлем статусы</p></div><label class="search-field"><Search :size="17" /><input v-model="search" placeholder="Аты, лауазымы немесе төлем түрі" /></label></header>
      <div v-if="employees.length" class="selection-bar" :class="{ active: selectionMode }">
        <button v-if="!selectionMode" type="button" class="button subtle" @click="toggleAll"><CheckCircle2 :size="16" /> Таңдау режимі</button>
        <template v-else>
          <div><label><input type="checkbox" :checked="allSelected" @change="toggleAll" /> {{ allSelected ? "Барлығы таңдалды" : "Барлығын таңдау" }}</label><button type="button" @click="closeSelection"><X :size="15" /> Аяқтау</button></div>
          <div v-if="selected.length"><strong>{{ selected.length }} таңдалды</strong><button type="button" @click="setPaidBulk(true)"><CheckCircle2 :size="15" /> Төленді</button><button type="button" @click="setPaidBulk(false)"><Clock3 :size="15" /> Төленбеді</button><button type="button" class="danger" @click="deleteBulk"><Trash2 :size="15" /> Өшіру</button></div>
          <span v-else>2–3 қызметкерді де жеке таңдай аласыз</span>
        </template>
      </div>

      <div v-if="employees.length" class="employee-table responsive-table" :class="{ selecting: selectionMode }">
        <div class="table-header"><span v-if="selectionMode" /><span>Қызметкер</span><span>Төлем түрі</span><span>Негізгі айлық</span><span>Қосымша</span><span>Пікір</span><span>Жалпы сома</span><span>Статус</span><span /></div>
        <div v-for="employee in employees" :key="employee.id" class="table-record" :class="{ selected: selectedIds.has(employee.id) }">
          <label v-if="selectionMode" class="row-check"><input type="checkbox" :checked="selectedIds.has(employee.id)" @change="toggle(employee.id)" /></label>
          <div class="person"><i>{{ employee.employeeName.slice(0, 1).toUpperCase() }}</i><span><strong>{{ employee.employeeName }}</strong><small>{{ employee.position || "Лауазым көрсетілмеген" }}</small></span></div>
          <div data-label="Төлем түрі"><span class="tag">{{ employee.paymentMethodName }}</span></div>
          <div data-label="Негізгі айлық" class="money">{{ formatMoney(employee.baseSalary) }}</div>
          <div data-label="Қосымша" class="components"><small v-for="component in employee.components" :key="component.id" :class="component.kind">{{ component.kind === "deduction" ? "−" : "+" }}{{ component.name }}: {{ formatMoney(component.amount) }}</small><small v-if="!employee.components.length">—</small></div>
          <button type="button" data-label="Пікір" class="note-button" :class="{ filled: employee.note }" @click="openNote(employee)"><MessageSquareText :size="15" /><span>{{ employee.note || "Пікір қосу" }}</span></button>
          <div data-label="Жалпы сома" class="money total">{{ formatMoney(employee.total) }}</div>
          <button type="button" data-label="Төлем статусы" class="status-toggle" :class="{ paid: employee.isPaid }" :disabled="payroll.isPending('toggleSalaryPaid', employee.id)" @click="payroll.mutate('toggleSalaryPaid', { id: employee.id, isPaid: !employee.isPaid })"><i><Check v-if="employee.isPaid" :size="13" /></i>{{ employee.isPaid ? "Төленді" : "Төленбеді" }}</button>
          <div class="row-actions"><button type="button" aria-label="Өзгерту" @click="openEdit(employee)"><Pencil :size="16" /></button><button type="button" class="danger" aria-label="Өшіру" @click="remove(employee)"><Trash2 :size="16" /></button></div>
        </div>
      </div>
      <div v-else class="empty-state"><span><UsersRound :size="25" /></span><strong>Бұл бөлімде қызметкер жоқ</strong><p>Қызметкерлерді Баптаулар бөлімінен қосыңыз немесе Excel арқылы импорттаңыз.</p><NuxtLink to="/settings" class="button primary">Баптауларға өту</NuxtLink></div>
    </section>
  </div>

  <EmployeeForm v-if="editOpen" :employee="editEmployee" @close="editOpen = false" @saved="editOpen = false" />
  <UiModal v-if="noteEmployee" title="Қызметкер пікірі" :description="noteEmployee.employeeName" @close="noteEmployee = null">
    <form class="form-stack" @submit.prevent="saveNote"><label class="form-field"><span>Пікір немесе ескерту</span><textarea v-model="note" maxlength="600" rows="5" placeholder="Мысалы: 50% берілді" /></label><div class="modal-actions"><button type="button" class="button ghost" @click="noteEmployee = null">Болдырмау</button><button class="button primary" :disabled="payroll.isPending('saveEmployeeNote', noteEmployee.id)">{{ payroll.isPending('saveEmployeeNote', noteEmployee.id) ? "Сақталуда…" : "Сақтау" }}</button></div></form>
  </UiModal>
</template>
