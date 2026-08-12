<script setup lang="ts">
import { ReceiptText, ShoppingBag } from "lucide-vue-next";
import type { ExpenseRecord } from "../../lib/types";

const props = withDefaults(defineProps<{ expense?: ExpenseRecord | null; oneTime?: boolean }>(), { expense: null, oneTime: false });
const emit = defineEmits<{ close: []; saved: [] }>();
const payroll = usePayroll();
const name = ref(props.expense?.name || "");
const amount = ref<number | null>(props.expense?.amount ?? null);
const categoryId = ref(props.expense?.categoryId || payroll.data.value?.expenseCategories.find(item => !item.archivedAt && !item.isOtherExpense)?.id || "");
const recurring = ref(props.expense?.isRecurring ?? true);
const categoryOptions = computed(() => payroll.data.value?.expenseCategories.filter(item => !item.archivedAt && !item.isOtherExpense).map(item => ({ value: item.id, label: item.name })) || []);

async function save() {
  const action = props.oneTime ? "saveOneTimeExpense" : "saveExpense";
  const success = await payroll.mutate(action, {
    id: props.expense?.id,
    name: name.value,
    amount: Number(amount.value || 0),
    ...(props.oneTime ? {} : { categoryId: categoryId.value, isRecurring: recurring.value }),
  });
  if (success) emit("saved");
}
</script>

<template>
  <UiModal :title="expense ? 'Шығынды өзгерту' : oneTime ? 'Жаңа шығын' : 'Операциялық шығын қосу'" :description="oneTime ? 'Сома жұмсалған ақша ретінде бірден реестрге кіреді' : 'Жоспарланған шығын және оның төлем статусы'" @close="emit('close')">
    <form class="form-stack" @submit.prevent="save">
      <div class="form-symbol"><ShoppingBag v-if="oneTime" :size="22" /><ReceiptText v-else :size="22" /></div>
      <label class="form-field"><span>Шығын атауы</span><input v-model="name" placeholder="Мысалы: Кеңсе арендасы" required /></label>
      <label v-if="!oneTime" class="form-field"><span>Категория</span><UiSmartSelect v-model="categoryId" :options="categoryOptions" search-placeholder="Категорияны іздеу" /></label>
      <label class="form-field"><span>Сома</span><div class="money-input"><input v-model.number="amount" type="number" min="1" step="1" placeholder="0" required /><b>₸</b></div></label>
      <label v-if="!oneTime" class="check-card"><input v-model="recurring" type="checkbox" /><span><strong>Әр ай сайын қайталанады</strong><small>Жаңа ай құрылғанда автоматты көшіріледі</small></span></label>
      <div class="modal-actions"><button type="button" class="button ghost" @click="emit('close')">Болдырмау</button><button class="button primary" :disabled="payroll.saving.value">{{ payroll.saving.value ? "Сақталуда…" : "Сақтау" }}</button></div>
    </form>
  </UiModal>
</template>
