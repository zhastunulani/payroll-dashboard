<script setup lang="ts">
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Network, RefreshCw, Search, Settings2, ShieldCheck, WalletCards } from "lucide-vue-next";
import { buildSmzPlan, type SmzPlan } from "../../lib/smz";

type ConfigRow = { id: string; employeeName: string; position: string; departmentName: string; paymentMethodName: string; smzEnabled: boolean; smzUnrestricted: boolean; jobLevel: number; smzLimit: number };
const payroll = usePayroll();
const { formatMoney } = useFormatters();
const rows = ref<ConfigRow[]>([]);
const query = ref("");
const accountModal = ref(false);
const selectedSalaryIds = ref<string[]>([]);
const expandedDepartmentIds = ref<string[]>([]);
const plan = ref<SmzPlan | null>(null);
const levelOptions = [
  { value: "1", label: "Қызметкер", description: "Орындаушы деңгейі" },
  { value: "2", label: "Жетекші", description: "Топ немесе бағыт жетекшісі" },
  { value: "3", label: "Бөлім басшысы", description: "Бөлімді басқарады" },
  { value: "4", label: "Директор", description: "Ең жоғары деңгей" },
];

function inferredLevel(position: string): number {
  const value = position.toLocaleLowerCase("kk-KZ");
  if (/директор|ceo|бас директор/.test(value)) return 4;
  if (/бөлім бас|руководител|head|басшы/.test(value)) return 3;
  if (/жетекші|лид|lead|менеджер/.test(value)) return 2;
  return 1;
}

const dataKey = computed(() => payroll.data.value ? `${payroll.data.value.selectedWorkspace.id}:${payroll.data.value.selectedMonth.id}` : "");
watch(dataKey, () => {
  const salaries = payroll.data.value?.salaries || [];
  const hasConfiguredAccount = salaries.some((salary) => salary.smzEnabled);
  rows.value = salaries.map((salary) => {
    const looksLikeSmz = /өзін-өзі|самоз|смз/i.test(salary.paymentMethodName);
    const isOwnerAccount = /^жасұлан$/i.test(salary.employeeName.trim()) && /кор+д|координ/i.test(salary.position);
    return { id: salary.id, employeeName: salary.employeeName, position: salary.position, departmentName: salary.departmentName, paymentMethodName: salary.paymentMethodName, smzEnabled: salary.smzEnabled || (!hasConfiguredAccount && looksLikeSmz), smzUnrestricted: salary.smzUnrestricted || isOwnerAccount, jobLevel: salary.jobLevel > 1 ? salary.jobLevel : inferredLevel(salary.position), smzLimit: salary.smzLimit || 1_200_000 };
  });
  selectedSalaryIds.value = [];
  expandedDepartmentIds.value = [];
  plan.value = null;
}, { immediate: true });

const sourceDepartments = computed(() => (payroll.data.value?.departments || []).map((department) => ({
  id: department.id,
  name: department.name,
  employees: department.employees.filter((employee) => employee.total > 0),
})));
const selectedSet = computed(() => new Set(selectedSalaryIds.value));
const selectedSalaries = computed(() => (payroll.data.value?.salaries || []).filter((salary) => selectedSet.value.has(salary.id) && salary.total > 0));
const selectedTotal = computed(() => selectedSalaries.value.reduce((sum, salary) => sum + salary.total, 0));
const selectedDepartmentsCount = computed(() => sourceDepartments.value.filter((department) => department.employees.some((employee) => selectedSet.value.has(employee.id))).length);
const filteredRows = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase("kk-KZ");
  return needle ? rows.value.filter((row) => `${row.employeeName} ${row.position} ${row.departmentName} ${row.paymentMethodName}`.toLocaleLowerCase("kk-KZ").includes(needle)) : rows.value;
});
const enabledRows = computed(() => rows.value.filter((row) => row.smzEnabled));
const enabledCount = computed(() => enabledRows.value.length);
const availableCapacity = computed(() => enabledRows.value.reduce((sum, row) => sum + Number(row.smzLimit || 0), 0));

function departmentState(departmentId: string): "none" | "some" | "all" {
  const department = sourceDepartments.value.find((item) => item.id === departmentId);
  if (!department) return "none";
  const count = department.employees.filter((employee) => selectedSet.value.has(employee.id)).length;
  return count === 0 ? "none" : count === department.employees.length ? "all" : "some";
}
function toggleDepartment(departmentId: string) {
  const department = sourceDepartments.value.find((item) => item.id === departmentId);
  if (!department) return;
  const next = new Set(selectedSalaryIds.value);
  const shouldSelect = departmentState(departmentId) !== "all";
  for (const employee of department.employees) {
    if (shouldSelect) next.add(employee.id);
    else next.delete(employee.id);
  }
  selectedSalaryIds.value = [...next];
  plan.value = null;
}
function toggleSalary(id: string) {
  const next = new Set(selectedSalaryIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedSalaryIds.value = [...next];
  plan.value = null;
}
function toggleDepartmentDetails(id: string) {
  expandedDepartmentIds.value = expandedDepartmentIds.value.includes(id) ? expandedDepartmentIds.value.filter((item) => item !== id) : [...expandedDepartmentIds.value, id];
}

async function transform() {
  if (!payroll.data.value || !selectedSalaryIds.value.length) {
    payroll.error.value = "SMZ арқылы жіберілетін бөлімді немесе қызметкерді таңдаңыз.";
    return;
  }
  if (!enabledCount.value) {
    payroll.error.value = "Кемінде бір SMZ шотын таңдаңыз.";
    accountModal.value = true;
    return;
  }
  const saved = await payroll.mutate("saveSmzSettings", { rows: rows.value.map((row) => ({ id: row.id, smzEnabled: row.smzEnabled, smzUnrestricted: row.smzUnrestricted, jobLevel: row.jobLevel, smzLimit: Number(row.smzLimit || 0) })) });
  if (!saved) return;
  const settings = new Map(rows.value.map((row) => [row.id, row]));
  plan.value = buildSmzPlan(selectedSalaries.value.map((salary) => ({ id: salary.id, employeeName: salary.employeeName, position: salary.position, departmentName: salary.departmentName, amount: salary.total, jobLevel: settings.get(salary.id)?.jobLevel ?? salary.jobLevel, isPaid: false })), enabledRows.value.map((row) => ({ salaryId: row.id, employeeName: row.employeeName, jobLevel: row.jobLevel, unrestricted: row.smzUnrestricted, limit: Number(row.smzLimit || 0) })));
}
</script>

<template>
  <div v-if="payroll.data.value" class="page smz-page">
    <section class="smz-summary">
      <div><span class="eyebrow">SMZ төлем маршруты</span><h2>Керек айлықтарды шоттарға бөліңіз</h2><p>Қай бөлімдер мен қызметкерлер SMZ арқылы кететінін өзіңіз таңдайсыз. Лимит пен қызметтік деңгей автоматты сақталады.</p></div>
      <div class="smz-summary-stats"><span><small>Таңдалған сома</small><strong>{{ formatMoney(selectedTotal) }}</strong></span><span><small>Қызметкерлер</small><strong>{{ selectedSalaryIds.length }}</strong></span><span><small>SMZ лимиті</small><strong>{{ formatMoney(availableCapacity) }}</strong></span></div>
    </section>

    <section class="panel smz-source-panel">
      <header class="section-heading"><div><span class="eyebrow">1-қадам · Төлем құрамын таңдау</span><h2>SMZ арқылы кететін айлықтар</h2><p>Бөлімді толық таңдаңыз немесе ішінен тек керекті адамдарды белгілеңіз.</p></div><span class="smz-selection-count">{{ selectedDepartmentsCount }} бөлім · {{ selectedSalaryIds.length }} адам</span></header>
      <div class="smz-department-list">
        <article v-for="department in sourceDepartments" :key="department.id" :class="{ selected: departmentState(department.id) !== 'none' }">
          <div class="smz-department-row">
            <button class="smz-department-check" type="button" :class="departmentState(department.id)" :disabled="!department.employees.length" @click="toggleDepartment(department.id)"><CheckCircle2 :size="18" /></button>
            <button class="smz-department-main" type="button" :disabled="!department.employees.length" @click="toggleDepartment(department.id)"><span><strong>{{ department.name }}</strong><small>{{ department.employees.length ? `${department.employees.length} қызметкердің айлығы` : 'Бұл айда айлық жазбасы жоқ' }}</small></span><b>{{ formatMoney(department.employees.reduce((sum, employee) => sum + employee.total, 0)) }}</b></button>
            <button class="smz-department-expand" type="button" :disabled="!department.employees.length" @click="toggleDepartmentDetails(department.id)"><span>{{ !department.employees.length ? 'Бос' : departmentState(department.id) === 'all' ? 'Барлығы' : departmentState(department.id) === 'some' ? `${department.employees.filter(employee => selectedSet.has(employee.id)).length} адам` : 'Адам таңдау' }}</span><ChevronDown v-if="expandedDepartmentIds.includes(department.id)" :size="17" /><ChevronRight v-else :size="17" /></button>
          </div>
          <div v-if="expandedDepartmentIds.includes(department.id)" class="smz-employee-choices">
            <label v-for="employee in department.employees" :key="employee.id"><input type="checkbox" :checked="selectedSet.has(employee.id)" @change="toggleSalary(employee.id)" /><i><CheckCircle2 :size="14" /></i><span><strong>{{ employee.employeeName }}</strong><small>{{ employee.position || 'Лауазым көрсетілмеген' }}</small></span><b>{{ formatMoney(employee.total) }}</b></label>
          </div>
        </article>
      </div>
    </section>

    <section class="panel smz-accounts-compact">
      <div class="smz-account-icon"><WalletCards :size="22" /></div><div><span class="eyebrow">2-қадам · Қабылдаушы шоттар</span><h2>SMZ шоттары</h2><p v-if="enabledCount">{{ enabledRows.map(row => row.employeeName).join(', ') }}</p><p v-else>Әлі бірде-бір SMZ шоты таңдалмаған.</p></div>
      <div class="smz-account-totals"><span><small>Шот саны</small><strong>{{ enabledCount }}</strong></span><span><small>Жалпы лимит</small><strong>{{ formatMoney(availableCapacity) }}</strong></span></div><button class="button secondary" type="button" @click="accountModal = true"><Settings2 :size="17" /> Шоттарды баптау</button>
    </section>
    <section class="smz-action-panel panel"><div><ShieldCheck :size="20" /><span><strong>Иерархия автоматты тексеріледі</strong><small>Төмен лауазымды SMZ шотына директордың ақшасы жіберілмейді.</small></span></div><button class="button primary" type="button" :disabled="payroll.saving.value || !selectedSalaryIds.length || !enabledCount" @click="transform"><RefreshCw :size="18" />{{ payroll.saving.value ? "Сақталуда…" : "Преобразовать" }}</button></section>

    <section v-if="plan" class="smz-results">
      <header class="section-heading"><div><span class="eyebrow">3-қадам · Дайын бөлу</span><h2>Төлем ведомосы</h2><p>{{ formatMoney(plan.allocated) }} бөлінді · {{ plan.accounts.length }} шот</p></div><span v-if="!plan.unallocatedTotal" class="smz-ready"><CheckCircle2 :size="18" /> Барлық сома бөлінді</span><span v-else class="smz-warning"><AlertTriangle :size="18" /> {{ formatMoney(plan.unallocatedTotal) }} бөлінбеді</span></header>
      <div class="smz-plan-grid">
        <article v-for="account in plan.accounts" :key="account.salaryId" class="smz-plan-card"><header><span><WalletCards :size="19" /></span><div><strong>{{ account.employeeName }}</strong><small>SMZ қабылдаушы · {{ account.unrestricted ? 'Барлық деңгей' : levelOptions[account.jobLevel - 1]?.label }}</small></div></header><div class="smz-capacity"><span><b>{{ formatMoney(account.used) }}</b><small>/ {{ formatMoney(account.limit) }}</small></span><em>{{ Math.round(account.used / account.limit * 100) }}%</em></div><div class="smz-progress"><i :style="{ width: `${Math.min(100, account.used / account.limit * 100)}%` }" /></div><div class="smz-allocation-list"><div v-for="item in account.allocations" :key="item.salaryId" :data-salary-id="item.salaryId"><span><strong>{{ item.employeeName }}</strong><small>{{ item.departmentName }} · {{ item.position || 'Лауазым жоқ' }}</small></span><b>{{ formatMoney(item.amount) }}</b></div><p v-if="!account.allocations.length">Бұл шотқа сома бөлінген жоқ.</p></div><footer>Қалған лимит <strong>{{ formatMoney(account.remaining) }}</strong></footer></article>
        <article v-if="plan.unallocated.length" class="smz-plan-card unallocated"><header><span><AlertTriangle :size="19" /></span><div><strong>Бөлінбеген сома</strong><small>Лимит немесе иерархия сәйкес келмейді</small></div></header><div class="smz-allocation-list"><div v-for="item in plan.unallocated" :key="item.salaryId"><span><strong>{{ item.employeeName }}</strong><small>{{ item.departmentName }} · {{ item.position || 'Лауазым жоқ' }}</small></span><b>{{ formatMoney(item.amount) }}</b></div></div><footer>Қолмен шешу керек <strong>{{ formatMoney(plan.unallocatedTotal) }}</strong></footer></article>
      </div>
    </section>
    <section v-else class="smz-empty panel"><span><Network :size="28" /></span><div><strong>Бөлу жоспары әлі құрылмады</strong><p>Айлықтар мен SMZ шоттарын таңдап, «Преобразовать» батырмасын басыңыз.</p></div></section>

    <UiModal v-if="accountModal" title="SMZ шоттарын баптау" description="Қабылдаушыларды, лимитті және қызметтік деңгейді белгілеңіз" wide @close="accountModal = false">
      <div class="smz-account-modal"><label class="smz-search"><Search :size="17" /><input v-model="query" placeholder="Аты, бөлімі немесе лауазымы" /></label><div class="smz-rule"><ShieldCheck :size="19" /><span><strong>SMZ шоты бар адамды ғана қосыңыз.</strong> «Барлық деңгейді қабылдайды» белгісі сенімді қызметкерге иерархиялық шектеусіз бөлуге мүмкіндік береді.</span></div><div class="smz-account-list"><article v-for="row in filteredRows" :key="row.id" :class="{ enabled: row.smzEnabled }"><label class="smz-toggle"><input v-model="row.smzEnabled" type="checkbox" /><i /><span><strong>{{ row.employeeName }}</strong><small>{{ row.position || row.departmentName }} · {{ row.paymentMethodName }}</small></span></label><label class="smz-unrestricted"><small>Қолжетімділік</small><span><input v-model="row.smzUnrestricted" type="checkbox" :disabled="!row.smzEnabled" /><i><CheckCircle2 :size="13" /></i><b>Барлық деңгей</b></span></label><label><small>Қызметтік деңгей</small><UiSmartSelect :model-value="String(row.jobLevel)" :options="levelOptions" :disabled="!row.smzEnabled || row.smzUnrestricted" @update:model-value="row.jobLevel = Number($event)" /></label><label><small>Бір айлық лимит</small><div class="money-input"><input v-model.number="row.smzLimit" type="number" min="1" step="1000" :disabled="!row.smzEnabled" /><b>₸</b></div></label></article></div><div class="modal-actions"><span>{{ enabledCount }} шот · {{ formatMoney(availableCapacity) }}</span><button class="button primary" type="button" :disabled="!enabledCount" @click="accountModal = false">Дайын</button></div></div>
    </UiModal>
  </div>
</template>
