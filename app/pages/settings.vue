<script setup lang="ts">
import { Archive, Building2, CalendarDays, CheckCircle2, FileSpreadsheet, KeyRound, Pencil, Plus, ReceiptText, RotateCcw, Search, Settings2, Trash2, Upload, UsersRound, WalletCards } from "lucide-vue-next";
import readExcelFile from "read-excel-file/browser";
import { salaryTotal } from "../../lib/calculations";
import { extractPayrollImportRow, parseDelimitedGrid, rowsFromGrid, selectImportSheets, type PayrollImportComponent } from "../../lib/payroll-import";
import type { SalaryRecord } from "../../lib/types";

type Section = "employees" | "months" | "departments" | "methods" | "categories" | "security";
type EntityType = "department" | "method" | "category";
type ImportRow = { department: string; fullName: string; position: string; paymentMethod: string; baseSalary: number; components: PayrollImportComponent[]; isPaid: boolean; error?: string };

const payroll = usePayroll();
const { formatMoney } = useFormatters();
const section = ref<Section>("employees");
const selectedDepartment = ref("");
const search = ref("");
const employeeForm = ref(false);
const editEmployee = ref<SalaryRecord | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importRows = ref<ImportRow[] | null>(null);
const importReading = ref(false);
const entityDraft = ref<{ type: EntityType; id?: string; name: string } | null>(null);
const passwordModal = ref(false);
const password = ref("");

const data = computed(() => payroll.data.value);
const departments = computed(() => data.value?.departments.filter(item => !item.archivedAt) || []);
watch(departments, list => { if (!list.some(item => item.id === selectedDepartment.value)) selectedDepartment.value = list[0]?.id || ""; }, { immediate: true });
const department = computed(() => departments.value.find(item => item.id === selectedDepartment.value));
const employees = computed(() => { const query = search.value.trim().toLocaleLowerCase("kk-KZ"); const rows = department.value?.employees || []; return query ? rows.filter(item => `${item.employeeName} ${item.position} ${item.paymentMethodName}`.toLocaleLowerCase("kk-KZ").includes(query)) : rows; });
const departmentOptions = computed(() => departments.value.map(item => ({ value: item.id, label: item.name, description: `${item.employees.length} қызметкер` })));
const importValid = computed(() => importRows.value?.filter(item => !item.error) || []);
const importErrors = computed(() => importRows.value?.filter(item => item.error) || []);

const sections = [
  { id: "employees" as const, label: "Қызметкерлер", text: "Қосу және импорт", icon: UsersRound },
  { id: "months" as const, label: "Есептік айлар", text: "Кезеңдерді басқару", icon: CalendarDays },
  { id: "departments" as const, label: "Бөлімдер", text: "Ұйым құрылымы", icon: Building2 },
  { id: "methods" as const, label: "Төлем түрлері", text: "Айлық анықтамалығы", icon: WalletCards },
  { id: "categories" as const, label: "Категориялар", text: "Шығын анықтамалығы", icon: ReceiptText },
  { id: "security" as const, label: "Қауіпсіздік", text: "Ортақ пароль", icon: KeyRound },
];

function openEmployee(employee: SalaryRecord | null = null) { editEmployee.value = employee; employeeForm.value = true; }
async function removeEmployee(employee: SalaryRecord) { if (confirm(`${employee.employeeName} және оның барлық айлардағы есептері толық өшіріледі. Жалғастыру керек пе?`)) await payroll.mutate("deleteEmployee", { employeeId: employee.employeeId }); }
async function readImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file || !data.value || !department.value) return;
  importReading.value = true;
  payroll.error.value = "";
  try {
    const buffer = await file.arrayBuffer();
    const raw = file.name.toLocaleLowerCase("kk-KZ").endsWith(".csv")
      ? rowsFromGrid(parseDelimitedGrid(new TextDecoder("utf-8").decode(buffer)))
      : selectImportSheets((await readExcelFile(buffer)).map(sheet => ({ sheet: sheet.sheet, data: sheet.data as unknown[][] })), department.value.id, department.value.name).flatMap(sheet => rowsFromGrid(sheet.data));
    if (!raw.length) throw new Error("Аты-жөні бар кесте табылмады.");
    const methods = data.value.paymentMethods.filter(item => !item.archivedAt);
    const fallbackMethod = methods.find(item => item.id === "method-transfer")?.name || methods[0]?.name || "";
    const knownMethods = new Set(methods.map(item => item.name.toLocaleLowerCase("kk-KZ")));
    const existing = new Set(data.value.salaries.map(item => `${item.departmentId}:${item.employeeName.toLocaleLowerCase("kk-KZ")}`));
    const seen = new Set<string>();
    importRows.value = raw.map(row => {
      const parsed = extractPayrollImportRow(row, { fallbackDepartment: department.value!.name, fallbackPaymentMethod: fallbackMethod, selectedMonth: data.value!.selectedMonth.month });
      const key = `${department.value!.id}:${parsed.fullName.toLocaleLowerCase("kk-KZ")}`;
      let error = "";
      if (!parsed.fullName) error = "Аты-жөні табылмады";
      else if (!knownMethods.has(parsed.paymentMethod.toLocaleLowerCase("kk-KZ"))) error = "Белгісіз төлем түрі";
      else if (!Number.isFinite(parsed.baseSalary) || parsed.baseSalary < 0) error = "Сома дұрыс емес";
      else if (existing.has(key)) error = "Бұл қызметкер осы айда бар";
      else if (seen.has(key)) error = "Файлда қайталанған жол";
      seen.add(key);
      return { ...parsed, department: department.value!.name, error: error || undefined };
    });
  } catch (caught) {
    payroll.error.value = caught instanceof Error ? caught.message : "Excel/CSV файлын оқу мүмкін болмады.";
  } finally {
    importReading.value = false;
  }
}
async function confirmImport() {
  if (!importValid.value.length) return;
  if (await payroll.mutate("importEmployees", { departmentId: selectedDepartment.value, rows: importValid.value })) importRows.value = null;
}
async function saveEntity() {
  if (!entityDraft.value) return;
  const action = entityDraft.value.type === "department" ? "saveDepartment" : entityDraft.value.type === "method" ? "savePaymentMethod" : "saveExpenseCategory";
  if (await payroll.mutate(action, { id: entityDraft.value.id, name: entityDraft.value.name })) entityDraft.value = null;
}
async function archiveEntity(type: EntityType, id: string, name: string) {
  if (!confirm(`${name} архивтелсін бе?`)) return;
  const action = type === "department" ? "archiveDepartment" : type === "method" ? "archivePaymentMethod" : "archiveExpenseCategory";
  await payroll.mutate(action, { id });
}
async function resetMonth(monthId: string, label: string) { if (confirm(`${label}: барлық төлем белгілері алынады. Сомалар мен жазбалар сақталады. Жалғастыру керек пе?`)) await payroll.mutate("resetMonthPayments", { targetMonthId: monthId }); }
async function deleteMonth(monthId: string, label: string) { if (confirm(`${label} есебі, айлық snapshot-тары және шығындары толық өшіріледі. Бұл әрекетті қайтару мүмкін емес. Жалғастыру керек пе?`)) await payroll.mutate("deleteMonth", { targetMonthId: monthId }); }
async function changePassword() { if (await payroll.mutate("changePassword", { password: password.value })) passwordModal.value = false; }
</script>

<template>
  <div v-if="data" class="page settings-page">
    <section class="settings-hero">
      <div><span class="settings-symbol"><Settings2 :size="24" /></span><span class="eyebrow">Басқару орталығы</span><h2>Барлық баптау бір жерде</h2><p>Қызметкерлерді, есептік айларды және қаржылық анықтамалықтарды басқарыңыз.</p></div>
      <div class="settings-overview"><span><small>Қызметкерлер</small><strong>{{ data.stats.employeeCount }}</strong></span><span><small>Бөлімдер</small><strong>{{ departments.length }}</strong></span><span><small>Есептік айлар</small><strong>{{ data.months.length }}</strong></span></div>
    </section>

    <section class="settings-tabs panel">
      <button v-for="item in sections" :key="item.id" type="button" :class="{ active: section === item.id }" @click="section = item.id"><component :is="item.icon" :size="19" /><span><strong>{{ item.label }}</strong><small>{{ item.text }}</small></span></button>
    </section>

    <section v-if="section === 'employees'" class="panel settings-workspace">
      <header class="workspace-header"><div><span class="eyebrow">Команданы басқару</span><h2>Қызметкерлер</h2><p>Таңдалған айдағы қызметкерлерді қосыңыз, импорттаңыз немесе өзгертіңіз.</p></div><div class="toolbar-actions"><label class="search-field"><Search :size="17" /><input v-model="search" placeholder="Аты немесе төлем түрі" /></label><button class="button secondary" type="button" :disabled="importReading" @click="importInput?.click()"><Upload :size="17" /> {{ importReading ? "Оқылуда…" : "Excel импорт" }}</button><input ref="importInput" hidden type="file" accept=".xlsx,.csv" @change="readImport" /><button class="button primary" type="button" @click="openEmployee()"><Plus :size="17" /> Қызметкер қосу</button></div></header>
      <div class="management-filter"><label><span>Қызметкер қосылатын бөлім</span><UiSmartSelect v-model="selectedDepartment" :options="departmentOptions" search-placeholder="Бөлімді іздеу" /></label><div><span>Қызметкерлер</span><strong>{{ department?.employees.length || 0 }}</strong></div><div class="amount"><span>Айлық қоры</span><strong>{{ formatMoney(department?.total || 0) }}</strong></div></div>
      <div v-if="employees.length" class="settings-employee-list">
        <article v-for="employee in employees" :key="employee.id"><div class="person"><i>{{ employee.employeeName.slice(0, 1).toUpperCase() }}</i><span><strong>{{ employee.employeeName }}</strong><small>{{ employee.position || department?.name }}</small></span></div><span class="tag">{{ employee.paymentMethodName }}</span><span><small>Негізгі айлық</small><b>{{ formatMoney(employee.baseSalary) }}</b></span><span><small>Жалпы сома</small><b class="brand-text">{{ formatMoney(employee.total) }}</b></span><div class="row-actions"><button type="button" @click="openEmployee(employee)"><Pencil :size="16" /></button><button type="button" class="danger" @click="removeEmployee(employee)"><Trash2 :size="16" /></button></div></article>
      </div>
      <div v-else class="empty-state"><span><UsersRound :size="25" /></span><strong>Бұл бөлімде қызметкер жоқ</strong><p>Қызметкер қосыңыз немесе дайын Excel/CSV файлын импорттаңыз.</p></div>
    </section>

    <section v-if="section === 'months'" class="panel settings-workspace">
      <header class="workspace-header"><div><span class="eyebrow">Тарихи snapshot</span><h2>Есептік айлар</h2><p>Төлем белгілерін нөлдеңіз немесе қажет емес айды толық өшіріңіз.</p></div></header>
      <div class="month-management-list"><article v-for="month in data.months" :key="month.id" :class="{ current: month.id === data.selectedMonth.id }"><span class="month-number">{{ String(month.month).padStart(2, '0') }}</span><div><strong>{{ month.label }}</strong><small>{{ month.id === data.selectedMonth.id ? "Қазір ашық есеп" : `${month.year} жылғы snapshot` }}</small></div><span v-if="month.id === data.selectedMonth.id" class="current-chip">Ашық</span><div class="month-actions"><button type="button" @click="resetMonth(month.id, month.label)"><RotateCcw :size="16" /> Сброс</button><button type="button" class="danger" :disabled="data.months.length <= 1" @click="deleteMonth(month.id, month.label)"><Trash2 :size="16" /> Өшіру</button></div></article></div>
    </section>

    <section v-if="section === 'departments' || section === 'methods' || section === 'categories'" class="panel settings-workspace">
      <header class="workspace-header"><div><span class="eyebrow">Қаржылық анықтамалық</span><h2>{{ section === 'departments' ? 'Бөлімдер' : section === 'methods' ? 'Төлем түрлері' : 'Шығын категориялары' }}</h2><p>{{ section === 'departments' ? 'Ұйым құрылымын басқарыңыз.' : section === 'methods' ? 'Айлық төлем форматтарын басқарыңыз.' : 'Шығындарды дұрыс жіктейтін категорияларды басқарыңыз.' }}</p></div><button class="button primary" type="button" @click="entityDraft = { type: section === 'departments' ? 'department' : section === 'methods' ? 'method' : 'category', name: '' }"><Plus :size="17" /> Қосу</button></header>
      <div class="reference-list">
        <article v-for="item in section === 'departments' ? data.departments : section === 'methods' ? data.paymentMethods : data.expenseCategories" :key="item.id"><span class="reference-icon"><Building2 v-if="section === 'departments'" :size="18" /><WalletCards v-else-if="section === 'methods'" :size="18" /><ReceiptText v-else :size="18" /></span><div><strong>{{ item.name }}</strong><small>{{ section === 'departments' ? `${data.departments.find(department => department.id === item.id)?.employees.length || 0} қызметкер` : section === 'methods' ? 'Қызметкердің төлем форматы' : ('isOtherExpense' in item && item.isOtherExpense) ? 'Бір реттік шығындар реестрі' : 'Операциялық шығын категориясы' }}</small></div><span v-if="item.archivedAt" class="archive-chip">Архив</span><span v-if="'isOtherExpense' in item && item.isOtherExpense" class="system-chip">Жүйелік</span><div v-if="!('isOtherExpense' in item && item.isOtherExpense)" class="row-actions"><button type="button" @click="entityDraft = { type: section === 'departments' ? 'department' : section === 'methods' ? 'method' : 'category', id: item.id, name: item.name }"><Pencil :size="16" /></button><button v-if="!item.archivedAt" type="button" @click="archiveEntity(section === 'departments' ? 'department' : section === 'methods' ? 'method' : 'category', item.id, item.name)"><Archive :size="16" /></button></div></article>
      </div>
    </section>

    <section v-if="section === 'security'" class="panel security-workspace"><span><CheckCircle2 :size="26" /></span><div><span class="eyebrow">Қауіпсіздік</span><h2>Ортақ пароль</h2><p>Пароль өзгергенде барлық ашық сессиялар жабылады және қайта кіру қажет болады.</p></div><button class="button primary" type="button" @click="passwordModal = true">Парольді өзгерту</button></section>
  </div>

  <EmployeeForm v-if="employeeForm" :employee="editEmployee" :default-department="selectedDepartment" @close="employeeForm = false" @saved="employeeForm = false" />

  <UiModal v-if="importRows" title="Импортты тексеру" :description="`${importValid.length} дайын · ${importErrors.length} қате`" wide @close="importRows = null">
    <div class="import-summary"><span><FileSpreadsheet :size="22" /></span><div><strong>{{ importValid.length }} қызметкер импортқа дайын</strong><small>Қате жолдар базаға жіберілмейді</small></div><b>{{ formatMoney(importValid.reduce((sum, row) => sum + salaryTotal(row.baseSalary, row.components.map((item, index) => ({ ...item, id: String(index) }))), 0)) }}</b></div>
    <div class="import-table"><div class="table-header"><span>Қызметкер</span><span>Төлем түрі</span><span>Негізгі айлық</span><span>Нәтиже</span></div><div v-for="(row, index) in importRows" :key="`${row.fullName}-${index}`" class="table-record" :class="{ invalid: row.error }"><div><strong>{{ row.fullName || 'Аты табылмады' }}</strong><small>{{ row.position || department?.name }}</small></div><span>{{ row.paymentMethod }}</span><b>{{ formatMoney(salaryTotal(row.baseSalary, row.components.map((item, itemIndex) => ({ ...item, id: String(itemIndex) })))) }}</b><span :class="row.error ? 'error-chip' : 'ready-chip'">{{ row.error || 'Дайын' }}</span></div></div>
    <div class="modal-actions"><button class="button ghost" type="button" @click="importRows = null">Болдырмау</button><button class="button primary" type="button" :disabled="!importValid.length || payroll.saving.value" @click="confirmImport">{{ payroll.saving.value ? 'Импортталуда…' : `${importValid.length} қызметкерді импорттау` }}</button></div>
  </UiModal>

  <UiModal v-if="entityDraft" :title="entityDraft.id ? 'Атауды өзгерту' : 'Жаңа жазба'" @close="entityDraft = null"><form class="form-stack" @submit.prevent="saveEntity"><label class="form-field"><span>Атауы</span><input v-model="entityDraft.name" autofocus required /></label><div class="modal-actions"><button type="button" class="button ghost" @click="entityDraft = null">Болдырмау</button><button class="button primary">Сақтау</button></div></form></UiModal>
  <UiModal v-if="passwordModal" title="Ортақ парольді өзгерту" description="Кемінде 10 таңба болуы керек" @close="passwordModal = false"><form class="form-stack" @submit.prevent="changePassword"><label class="form-field"><span>Жаңа пароль</span><input v-model="password" type="password" minlength="10" autocomplete="new-password" required /></label><div class="modal-actions"><button type="button" class="button ghost" @click="passwordModal = false">Болдырмау</button><button class="button primary">Парольді өзгерту</button></div></form></UiModal>
</template>
