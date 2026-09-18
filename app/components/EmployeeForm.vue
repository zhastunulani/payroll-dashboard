<script setup lang="ts">
import { MinusCircle, Plus, UserRound } from "lucide-vue-next";
import type { SalaryComponentKind, SalaryRecord } from "../../lib/types";

const props = defineProps<{ employee?: SalaryRecord | null; defaultDepartment?: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const payroll = usePayroll();
const { t } = useLocale();

type DraftComponent = { id?: string; name: string; kind: SalaryComponentKind; amount: number | null };
const fullName = ref(props.employee?.employeeName || "");
const position = ref(props.employee?.position || "");
const departmentId = ref(props.employee?.departmentId || props.defaultDepartment || payroll.data.value?.departments.find(item => !item.archivedAt)?.id || "");
const paymentMethodId = ref(props.employee?.paymentMethodId || payroll.data.value?.paymentMethods.find(item => !item.archivedAt)?.id || "");
const baseSalary = ref<number>(props.employee?.baseSalary ?? 0);
const note = ref(props.employee?.note || "");
const components = ref<DraftComponent[]>(props.employee?.components.map(item => ({ ...item })) || []);
const departmentOptions = computed(() => payroll.data.value?.departments.filter(item => !item.archivedAt).map(item => ({ value: item.id, label: item.name, description: `${item.employees.length} ${t("қызметкер")}` })) || []);
const methodOptions = computed(() => payroll.data.value?.paymentMethods.filter(item => !item.archivedAt).map(item => ({ value: item.id, label: item.name })) || []);
const total = computed(() => Math.max(0, Number(baseSalary.value || 0) + components.value.reduce((sum, item) => sum + (item.kind === "deduction" ? -Number(item.amount || 0) : Number(item.amount || 0)), 0)));
const { formatMoney } = useFormatters();

function addComponent(kind: SalaryComponentKind) {
  components.value.push({ name: kind === "addition" ? "Қосымша" : "Ұсталым", kind, amount: null });
}
async function save() {
  const success = await payroll.mutate("saveEmployee", {
    employeeId: props.employee?.employeeId,
    fullName: fullName.value,
    position: position.value,
    departmentId: departmentId.value,
    paymentMethodId: paymentMethodId.value,
    baseSalary: Number(baseSalary.value || 0),
    note: note.value,
    components: components.value.map(item => ({ ...item, amount: Number(item.amount || 0) })),
  });
  if (success) emit("saved");
}
</script>

<template>
  <UiModal :title="employee ? t('Қызметкерді өзгерту') : t('Қызметкер қосу')" :description="t('Айлық сомасы осы есептік айға жеке snapshot ретінде сақталады')" wide @close="emit('close')">
    <form class="form-stack" @submit.prevent="save">
      <div class="employee-form-intro"><span><UserRound :size="21" /></span><div><strong>{{ employee ? employee.employeeName : t("Жаңа қызметкер") }}</strong><small>{{ t("Негізгі ақпарат пен төлем шарттары") }}</small></div><b>{{ formatMoney(total) }}</b></div>
      <div class="form-grid two">
        <label class="form-field"><span>{{ t("Аты-жөні") }}</span><input v-model="fullName" :placeholder="t('Толық аты-жөні')" required /></label>
        <label class="form-field"><span>{{ t("Лауазымы") }}</span><input v-model="position" :placeholder="t('Мысалы: куратор')" /></label>
        <label class="form-field"><span>{{ t("Бөлім") }}</span><UiSmartSelect v-model="departmentId" :options="departmentOptions" :search-placeholder="t('Бөлімді іздеу')" /></label>
        <label class="form-field"><span>{{ t("Төлем түрі") }}</span><UiSmartSelect v-model="paymentMethodId" :options="methodOptions" :search-placeholder="t('Төлем түрін іздеу')" /></label>
        <label class="form-field"><span>{{ t("Негізгі айлық") }}</span><div class="money-input"><input v-model.number="baseSalary" type="number" min="0" step="1" placeholder="0" /><b>₸</b></div></label>
        <label class="form-field"><span>{{ t("Пікір") }}</span><input v-model="note" maxlength="600" :placeholder="t('Мысалы: 50% берілді')" /></label>
      </div>
      <section class="component-editor">
        <header><div><strong>{{ t("Айлық компоненттері") }}</strong><small>{{ t("Қосымша төлемдер мен ұсталымдар") }}</small></div><span><button type="button" @click="addComponent('addition')"><Plus :size="15" /> {{ t("Қосымша") }}</button><button type="button" @click="addComponent('deduction')"><MinusCircle :size="15" /> {{ t("Ұсталым") }}</button></span></header>
        <div v-if="components.length" class="component-rows">
          <div v-for="(component, index) in components" :key="component.id || index">
            <UiSmartSelect v-model="component.kind" :options="[{ value: 'addition', label: t('Қосымша төлем') }, { value: 'deduction', label: t('Ұсталым') }]" />
            <input v-model="component.name" :placeholder="t('Атауы')" required />
            <div class="money-input"><input v-model.number="component.amount" type="number" min="0" step="1" placeholder="0" required /><b>₸</b></div>
            <button type="button" class="icon-button danger" :aria-label="t('Компонентті өшіру')" @click="components.splice(index, 1)"><MinusCircle :size="18" /></button>
          </div>
        </div>
        <p v-else>{{ t("Қосымша төлем немесе ұсталым жоқ.") }}</p>
      </section>
      <div class="salary-total"><span>{{ t("Қызметкердің жалпы айлығы") }}</span><strong>{{ formatMoney(total) }}</strong></div>
      <div class="modal-actions"><button type="button" class="button ghost" @click="emit('close')">{{ t("Болдырмау") }}</button><button class="button primary" :disabled="payroll.saving.value">{{ payroll.saving.value ? t("Сақталуда…") : t("Сақтау") }}</button></div>
    </form>
  </UiModal>
</template>
