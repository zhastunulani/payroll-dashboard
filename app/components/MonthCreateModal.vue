<script setup lang="ts">
import { CopyPlus, ReceiptText, UsersRound, WalletCards } from "lucide-vue-next";
import { nextAvailableMonthId, shouldCopyDepartmentToNewMonth } from "../../lib/months";
import type { PayrollData } from "../../lib/types";

const props = defineProps<{ target?: string }>();
const emit = defineEmits<{ close: [] }>();
const payroll = usePayroll();
const { formatMoney } = useFormatters();

const months = computed(() => payroll.data.value?.months ?? []);
const monthOptions = computed(() => months.value.map(item => ({ value: item.id, label: item.label, description: `${item.year} жыл · ${String(item.month).padStart(2, "0")} ай`, keywords: `${item.year} ${item.month}` })));
// Copy from the closest earlier month by default: that is the last known team and payments.
const sourceMonthId = ref(months.value.find(m => !props.target || m.id < props.target)?.id ?? months.value[0]?.id ?? "");
const targetMonthId = ref(props.target ?? nextAvailableMonthId(sourceMonthId.value, months.value.map(m => m.id)));
const copyRecurring = ref(true);
const preview = ref<PayrollData | null>(null);
const previewLoading = ref(false);

const copyable = computed(() => preview.value?.departments.filter(d => shouldCopyDepartmentToNewMonth(d.id, d.name)) ?? []);
const copyableEmployees = computed(() => copyable.value.reduce((sum, d) => sum + d.employees.length, 0));
const copyableSalary = computed(() => copyable.value.reduce((sum, d) => sum + d.total, 0));
const recurringExpenses = computed(() => preview.value?.expenses.filter(e => e.isRecurring) ?? []);
const exists = computed(() => months.value.some(m => m.id === targetMonthId.value));

async function loadPreview() {
  const data = payroll.data.value;
  if (!data || !sourceMonthId.value) return;
  if (data.selectedMonth.id === sourceMonthId.value) { preview.value = data; return; }
  previewLoading.value = true;
  try {
    preview.value = await $fetch<PayrollData>("/api/payroll", { query: { month: sourceMonthId.value, workspace: data.selectedWorkspace.id } });
  } finally {
    previewLoading.value = false;
  }
}
onMounted(loadPreview);

async function create() {
  const saved = await payroll.mutate("createMonth", { newMonthId: targetMonthId.value, sourceMonthId: sourceMonthId.value, copyRecurringExpenses: copyRecurring.value });
  // createMonth answers with the new month already opened.
  if (saved) emit("close");
}
</script>

<template>
  <UiModal title="Жаңа есептік ай" :description="`${payroll.data.value?.selectedWorkspace.name ?? ''}: қызметкерлер мен ай сайынғы міндетті төлемдер таңдалған айдан көшіріледі`" wide @close="emit('close')">
    <form class="form-stack" @submit.prevent="create">
      <div class="form-grid two">
        <label class="form-field"><span>Қай айдан көшіру</span><UiSmartSelect v-model="sourceMonthId" :options="monthOptions" search-placeholder="Айды іздеу" @update:model-value="loadPreview" /></label>
        <label class="form-field"><span>Құрылатын ай</span><input v-model="targetMonthId" type="month" min="2020-01" max="2100-12" required /></label>
      </div>
      <p v-if="exists" class="finance-error">Бұл ай бұрыннан бар.</p>
      <div class="copy-summary" :class="{ loading: previewLoading }">
        <div><span><UsersRound :size="19" /></span><small>Көшірілетін команда</small><strong>{{ copyableEmployees }} адам</strong><em>Кураторлар мен Сату бөлімі бос ашылады</em></div>
        <div><span><WalletCards :size="19" /></span><small>Айлық қоры</small><strong>{{ formatMoney(copyableSalary) }}</strong></div>
        <div><span><ReceiptText :size="19" /></span><small>Міндетті төлемдер</small><strong>{{ formatMoney(recurringExpenses.reduce((sum, item) => sum + item.amount, 0)) }}</strong><em>{{ recurringExpenses.length }} жазба</em></div>
      </div>
      <label class="check-card"><input v-model="copyRecurring" type="checkbox" /><span><strong>Міндетті төлемдерді көшіру</strong><small>Аренда, интернет, подписка — ай сайын қайталанатындар</small></span></label>
      <div class="inline-note"><CopyPlus :size="18" /><span>Айлықтар мен қосымша/ұсталымдар көшіріледі. Барлық «Төленді» белгілері жаңа айда басынан басталады. Басқа (бір реттік) шығындар көшірілмейді.</span></div>
      <div class="modal-actions"><button type="button" class="button ghost" @click="emit('close')">Болдырмау</button><button class="button primary" :disabled="payroll.saving.value || previewLoading || exists || !sourceMonthId">{{ payroll.saving.value ? "Құрылуда…" : "Айды құру" }}</button></div>
    </form>
  </UiModal>
</template>
