<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import { FINANCE_CATEGORIES, type FinanceEntry } from "../../lib/finance";

const props = defineProps<{ entry: Partial<FinanceEntry> }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const finance = useFinance();
const form = ref<Partial<FinanceEntry>>({ currency: "KZT", ...props.entry });
const saving = ref(false);
const error = ref("");
const isNew = computed(() => !props.entry.id);
const usdAmount = computed(() => {
  const usd = Number(form.value.currencyAmount), rate = Number(form.value.fxRate);
  return usd > 0 && rate > 0 ? Math.round(usd * rate * 100) / 100 : null;
});
const categories = Object.entries(FINANCE_CATEGORIES).filter(([key]) => key !== "revenue");

async function save() {
  saving.value = true;
  error.value = await finance.saveEntry({ ...form.value, amount: form.value.currency === "USD" ? usdAmount.value : form.value.amount });
  saving.value = false;
  if (!error.value) emit("saved");
}
async function remove() {
  if (!props.entry.id || !confirm(`«${props.entry.name}» жазбасы өшірілсін бе? Өзгерістер тарихында сақталады.`)) return;
  saving.value = true;
  error.value = await finance.deleteEntry(props.entry as FinanceEntry);
  saving.value = false;
  if (!error.value) emit("saved");
}
</script>

<template>
  <UiModal :title="isNew ? 'Жаңа қаржылық жазба' : 'Жазбаны өзгерту'" description="Payroll-да жоқ шығындар: таргет, салық, мердігер, жабдық. Payroll-дағы жазбаны қайталамаңыз." wide @close="!saving && emit('close')">
    <form class="form-grid two entry-form" @submit.prevent="save">
      <label class="form-field">Жоба<select v-model="form.workspaceId" required><option v-for="p in finance.projects.value" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <label class="form-field">Есептік ай<input v-model="form.period" type="month" required></label>
      <label class="form-field wide">Атауы<input v-model="form.name" maxlength="200" required placeholder="Мысалы: Meta таргет, 1–15 қыркүйек"></label>
      <label class="form-field">Категория<select v-model="form.category"><option v-for="[key, label] in categories" :key="key" :value="key">{{ label }}</option></select></label>
      <div class="form-field">Валюта
        <div class="segmented" role="group" aria-label="Валюта">
          <button type="button" :class="{ active: form.currency !== 'USD' }" @click="form.currency = 'KZT'">₸ теңге</button>
          <button type="button" :class="{ active: form.currency === 'USD' }" @click="form.currency = 'USD'">$ USD</button>
        </div>
      </div>
      <template v-if="form.currency === 'USD'">
        <label class="form-field">Сома, $<input v-model="form.currencyAmount" type="number" min="0" step="0.01" required></label>
        <label class="form-field">Бағам, ₸ / $<input v-model="form.fxRate" type="number" min="0" step="0.0001" required placeholder="Банк бағамы"></label>
        <p class="form-field wide entry-fx">Теңгемен: <b>{{ money(usdAmount) }}</b> — есепке осы сома кіреді.</p>
      </template>
      <label v-else class="form-field">Сома, ₸<input v-model="form.amount" type="number" min="0" step="0.01" placeholder="Белгісіз болса бос қалдырыңыз"></label>
      <label class="form-field">Факт / жоспар<select v-model="form.basis"><option value="actual">Факт</option><option value="plan">Жоспар (бюджет)</option></select></label>
      <label class="form-field">Төлем күйі<select v-model="form.status"><option value="paid">Төленген</option><option value="unpaid">Төленбеген</option><option value="unknown">Расталмаған</option></select></label>
      <label class="form-field wide">Есепке қосу<select v-model="form.disposition"><option value="included">Есепке қосылады</option><option value="review">Нақтылау керек — қосылмайды</option><option value="duplicate">Қайталама / есептен тыс — қосылмайды</option></select></label>
      <label class="form-field wide">Дереккөз<input v-model="form.source" maxlength="1000" placeholder="Чек, шот, Meta Ads есебі…"></label>
      <label class="form-field wide">Түсіндірме<textarea v-model="form.note" rows="3" maxlength="3000" /></label>
      <p v-if="error" class="finance-error form-field wide" role="alert">{{ error }}</p>
      <div class="modal-actions form-field wide">
        <button v-if="entry.origin === 'manual'" type="button" class="button ghost danger-text" :disabled="saving" @click="remove"><Trash2 :size="16" /> Өшіру</button>
        <button type="button" class="button ghost" :disabled="saving" @click="emit('close')">Болдырмау</button>
        <button class="button primary" :disabled="saving">{{ saving ? "Сақталуда…" : "Сақтау" }}</button>
      </div>
    </form>
  </UiModal>
</template>
