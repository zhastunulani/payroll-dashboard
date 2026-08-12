<script setup lang="ts">
import { ChevronLeft, ChevronRight, CopyPlus, Plus, ReceiptText, UsersRound, WalletCards } from "lucide-vue-next";
import { shouldCopyDepartmentToNewMonth, nextAvailableMonthId } from "../../lib/months";
import type { PayrollData } from "../../lib/types";

const payroll = usePayroll();
const route = useRoute();
const { formatMoney } = useFormatters();
const monthModal = ref(false);
const sourceMonthId = ref("");
const targetMonthId = ref("");
const copyRecurring = ref(true);
const preview = ref<PayrollData | null>(null);
const previewLoading = ref(false);

const titles: Record<string, { eyebrow: string; title: string; text: string }> = {
  "/": { eyebrow: "Басқару панелі", title: "Қаржылық шолу", text: "Жоспар, төлем және айлық динамика" },
  "/departments": { eyebrow: "Команда", title: "Бөлімдердің айлығы", text: "Әр бөлімнің жалақы қорын басқарыңыз" },
  "/expenses": { eyebrow: "Операциялар", title: "Тұрақты шығындар", text: "Аренда, интернет және сервистер" },
  "/other-expenses": { eyebrow: "Реестр", title: "Жұмсалған ақша", text: "Бір реттік сатып алулар мен шығындар" },
  "/settings": { eyebrow: "Жүйе", title: "Баптаулар", text: "Айлар, команда және анықтамалықтар" },
};
const heading = computed(() => titles[route.path] ?? titles["/"]!);
const monthOptions = computed(() => payroll.data.value?.months.map(item => ({
  value: item.id,
  label: item.label,
  description: `${item.year} жыл · ${String(item.month).padStart(2, "0")} ай`,
  keywords: `${item.year} ${item.month}`,
})) || []);
const currentIndex = computed(() => payroll.data.value?.months.findIndex(item => item.id === payroll.data.value?.selectedMonth.id) ?? -1);
const canOlder = computed(() => currentIndex.value >= 0 && currentIndex.value < (payroll.data.value?.months.length || 0) - 1);
const canNewer = computed(() => currentIndex.value > 0);
const copyableEmployees = computed(() => preview.value?.departments.filter(department => shouldCopyDepartmentToNewMonth(department.id, department.name)).reduce((sum, department) => sum + department.employees.length, 0) || 0);
const copyableSalary = computed(() => preview.value?.departments.filter(department => shouldCopyDepartmentToNewMonth(department.id, department.name)).reduce((sum, department) => sum + department.total, 0) || 0);
const recurringExpenses = computed(() => preview.value?.expenses.filter(expense => expense.isRecurring) || []);

function chooseMonth(month: string) {
  if (month !== payroll.data.value?.selectedMonth.id) payroll.load(month);
}
function move(offset: number) {
  const target = payroll.data.value?.months[currentIndex.value + offset];
  if (target) payroll.load(target.id);
}
function openMonth() {
  const data = payroll.data.value;
  if (!data) return;
  sourceMonthId.value = data.selectedMonth.id;
  targetMonthId.value = nextAvailableMonthId(sourceMonthId.value, data.months.map(item => item.id));
  copyRecurring.value = true;
  preview.value = data;
  monthModal.value = true;
}
async function loadPreview() {
  const data = payroll.data.value;
  if (!data) return;
  targetMonthId.value = nextAvailableMonthId(sourceMonthId.value, data.months.map(item => item.id));
  if (sourceMonthId.value === data.selectedMonth.id) {
    preview.value = data;
    return;
  }
  previewLoading.value = true;
  try {
    preview.value = await $fetch<PayrollData>("/api/payroll", {
      query: {
        month: sourceMonthId.value,
        workspace: data.selectedWorkspace.id,
      },
    });
  } finally {
    previewLoading.value = false;
  }
}
async function createMonth() {
  const saved = await payroll.mutate("createMonth", {
    newMonthId: targetMonthId.value,
    sourceMonthId: sourceMonthId.value,
    copyRecurringExpenses: copyRecurring.value,
  });
  if (saved) monthModal.value = false;
}
</script>

<template>
  <header class="period-header">
    <div class="page-heading"><span class="eyebrow">{{ heading.eyebrow }}</span><h1>{{ heading.title }}</h1><p>{{ heading.text }}</p></div>
    <div v-if="payroll.data.value" class="period-controls">
      <div class="month-control">
        <button type="button" aria-label="Алдыңғы ай" :disabled="!canOlder" @click="move(1)"><ChevronLeft :size="18" /></button>
        <UiSmartSelect
          :model-value="payroll.data.value.selectedMonth.id"
          :options="monthOptions"
          label="Есептік кезең"
          search-placeholder="Айды немесе жылды іздеу"
          @update:model-value="chooseMonth"
        />
        <button type="button" aria-label="Келесі ай" :disabled="!canNewer" @click="move(-1)"><ChevronRight :size="18" /></button>
      </div>
      <button class="button primary new-month-button" type="button" @click="openMonth"><Plus :size="18" /><span><strong>Жаңа ай</strong><small>Есепті көшіру</small></span></button>
    </div>
  </header>

  <UiModal v-if="monthModal" title="Жаңа есептік ай" description="Кез келген айды негізге алып, жаңа есеп құрыңыз" wide @close="monthModal = false">
    <form class="form-stack" @submit.prevent="createMonth">
      <div class="form-grid two">
        <label class="form-field"><span>Негіз болатын ай</span><UiSmartSelect v-model="sourceMonthId" :options="monthOptions" search-placeholder="Айды іздеу" @update:model-value="loadPreview" /></label>
        <label class="form-field"><span>Құрылатын ай</span><input v-model="targetMonthId" type="month" min="2020-01" max="2100-12" required /></label>
      </div>
      <div class="copy-summary" :class="{ loading: previewLoading }">
        <div><span><UsersRound :size="19" /></span><small>Көшірілетін команда</small><strong>{{ copyableEmployees }} адам</strong><em>Кураторлар мен Сату бөлімі бос ашылады</em></div>
        <div><span><WalletCards :size="19" /></span><small>Айлық қоры</small><strong>{{ formatMoney(copyableSalary) }}</strong></div>
        <div><span><ReceiptText :size="19" /></span><small>Тұрақты шығындар</small><strong>{{ formatMoney(recurringExpenses.reduce((sum, item) => sum + item.amount, 0)) }}</strong><em>{{ recurringExpenses.length }} жазба</em></div>
      </div>
      <label class="check-card"><input v-model="copyRecurring" type="checkbox" /><span><strong>Тұрақты шығындарды көшіру</strong><small>Аренда, интернет және ай сайынғы сервистер</small></span></label>
      <div class="inline-note"><CopyPlus :size="18" /><span>Қызметкерлердің айлықтары мен компоненттері көшіріледі. Барлық «Төленді» белгілері жаңадан басталады.</span></div>
      <div class="modal-actions"><button type="button" class="button ghost" @click="monthModal = false">Болдырмау</button><button class="button primary" :disabled="payroll.saving.value || previewLoading">{{ payroll.saving.value ? "Құрылуда…" : "Айды құру" }}</button></div>
    </form>
  </UiModal>
</template>
