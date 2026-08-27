<script setup lang="ts">
import { Building2, Check, Download, FileSpreadsheet, UsersRound } from "lucide-vue-next";
import { buildPayrollStatement, buildPayrollStatementSheet, payrollStatementFileName } from "../../lib/payroll-export";

const emit = defineEmits<{ close: [] }>();
const payroll = usePayroll();
const { formatMoney } = useFormatters();
const selectedIds = ref(new Set<string>());
const exporting = ref(false);
const exportError = ref("");

const data = computed(() => payroll.data.value);
const departments = computed(() => data.value?.departments.filter((item) => !item.archivedAt) || []);
const allSelected = computed(() => departments.value.length > 0 && departments.value.every((item) => selectedIds.value.has(item.id)));
const statement = computed(() => data.value ? buildPayrollStatement(data.value, selectedIds.value) : null);

onMounted(() => {
  selectedIds.value = new Set(departments.value.map((department) => department.id));
});

function toggleDepartment(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(departments.value.map((department) => department.id));
}

async function exportExcel() {
  const report = statement.value;
  if (!report || !report.departments.length) return;
  const sheet = buildPayrollStatementSheet(report);
  exportError.value = "";
  exporting.value = true;
  try {
    const { default: writeXlsxFile } = await import("write-excel-file");
    await writeXlsxFile(sheet.rows, {
      columns: sheet.columns,
      fileName: payrollStatementFileName(report),
      sheet: "Төлем ведомосы",
      stickyRowsCount: 1,
      showGridLines: true,
    });
    emit("close");
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : "Excel файлын жасау мүмкін болмады.";
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <UiModal title="Төлем ведомосы" :description="`${data?.selectedMonth.label || ''} · Excel экспорты`" wide @close="emit('close')">
    <div class="export-workspace">
      <section class="export-summary">
        <span><FileSpreadsheet :size="23" /></span>
        <div><small>Таңдалған есеп</small><strong>{{ data?.selectedWorkspace.name }} · {{ data?.selectedMonth.label }}</strong><em>Excel-де нақты төленетін қорытынды сома көрсетіледі</em></div>
        <div><small>Қызметкерлер</small><strong>{{ statement?.employeeCount || 0 }}</strong></div>
        <div class="amount"><small>Төленетін сома</small><strong>{{ formatMoney(statement?.payableAmount || 0) }}</strong></div>
      </section>

      <div class="export-selector-heading">
        <div><span class="eyebrow">Экспорт құрамы</span><h3>Қажетті бөлімдерді таңдаңыз</h3><p>Тек белгіленген бөлімдер Excel ведомосына қосылады.</p></div>
        <button class="button subtle" type="button" @click="toggleAll"><Check :size="16" /> {{ allSelected ? "Барлығын алып тастау" : "Барлығын таңдау" }}</button>
      </div>

      <div class="export-department-grid">
        <button v-for="department in departments" :key="department.id" type="button" :class="{ selected: selectedIds.has(department.id) }" @click="toggleDepartment(department.id)">
          <i><Check v-if="selectedIds.has(department.id)" :size="15" /></i>
          <span><strong>{{ department.name }}</strong><small><UsersRound :size="13" /> {{ department.employees.length }} қызметкер</small></span>
          <b>{{ formatMoney(department.total) }}</b>
        </button>
      </div>

      <div v-if="exportError" class="form-alert">{{ exportError }}</div>
      <div v-if="!departments.length" class="empty-state"><span><Building2 :size="25" /></span><strong>Экспорттайтын бөлім жоқ</strong><p>Алдымен бөлім мен қызметкерлерді қосыңыз.</p></div>
      <div class="modal-actions export-actions">
        <button type="button" class="button ghost" @click="emit('close')">Болдырмау</button>
        <button type="button" class="button primary" :disabled="exporting || !selectedIds.size" @click="exportExcel"><Download :size="17" /> {{ exporting ? "Excel дайындалуда…" : "Excel жүктеу" }}</button>
      </div>
    </div>
  </UiModal>
</template>
