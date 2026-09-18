<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import { FINANCE_CATEGORIES, type FinanceEntry } from "../../lib/finance";

const props = defineProps<{ entry: Partial<FinanceEntry> }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const finance = useFinance();
const { t } = useLocale();
// Older imported rows carry an «unknown» status; for the owner that money is simply spent.
const form = ref<Partial<FinanceEntry>>({ currency: "KZT", ...props.entry, status: props.entry.status === "unpaid" ? "unpaid" : "paid" });
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
  if (!props.entry.id || !confirm(`«${props.entry.name}» ${t("жазбасы өшірілсін бе? Өзгерістер тарихында сақталады.")}`)) return;
  saving.value = true;
  error.value = await finance.deleteEntry(props.entry as FinanceEntry);
  saving.value = false;
  if (!error.value) emit("saved");
}
</script>

<template>
  <UiModal :title="isNew ? t('Жаңа қаржылық жазба') : t('Жазбаны өзгерту')" :description="t('Таргет, жабдық, іс-шара, мердігер сияқты шығындар. Айлық пен міндетті төлемдер өз беттерінде енгізіледі — оларды мұнда қайталамаңыз.')" wide @close="!saving && emit('close')">
    <form class="form-grid two entry-form" @submit.prevent="save">
      <label class="form-field">{{ t("Жоба") }}<select v-model="form.workspaceId" required><option v-for="p in finance.projects.value" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <label class="form-field">{{ t("Есептік ай") }}<input v-model="form.period" type="month" required></label>
      <label class="form-field wide">{{ t("Атауы") }}<input v-model="form.name" maxlength="200" required :placeholder="t('Мысалы: Meta таргет, 1–15 қыркүйек')"></label>
      <label class="form-field">{{ t("Категория") }}<select v-model="form.category"><option v-for="[key, label] in categories" :key="key" :value="key">{{ t(label) }}</option></select></label>
      <div class="form-field">{{ t("Валюта") }}
        <div class="segmented" role="group" :aria-label="t('Валюта')">
          <button type="button" :class="{ active: form.currency !== 'USD' }" @click="form.currency = 'KZT'">{{ t("₸ теңге") }}</button>
          <button type="button" :class="{ active: form.currency === 'USD' }" @click="form.currency = 'USD'">$ USD</button>
        </div>
      </div>
      <template v-if="form.currency === 'USD'">
        <label class="form-field">{{ t("Сома, $") }}<input v-model="form.currencyAmount" type="number" min="0" step="0.01" required></label>
        <label class="form-field">{{ t("Бағам, ₸ / $") }}<input v-model="form.fxRate" type="number" min="0" step="0.0001" required :placeholder="t('Банк бағамы')"></label>
        <p class="form-field wide entry-fx">{{ t("Теңгемен:") }} <b>{{ money(usdAmount) }}</b> {{ t("— есепке осы сома кіреді.") }}</p>
      </template>
      <label v-else class="form-field">{{ t("Сома, ₸") }}<input v-model="form.amount" type="number" min="0" step="0.01" :placeholder="t('Белгісіз болса бос қалдырыңыз')"></label>
      <label class="form-field">{{ t("Факт / жоспар") }}<select v-model="form.basis"><option value="actual">{{ t("Факт") }}</option><option value="plan">{{ t("Жоспар (бюджет)") }}</option></select></label>
      <label class="form-field">{{ t("Төлем") }}<select v-model="form.status"><option value="paid">{{ t("Жұмсалды (төленді)") }}</option><option value="unpaid">{{ t("Әлі төленуі керек") }}</option></select></label>
      <label class="form-field wide">{{ t("Есепке қосу") }}<select v-model="form.disposition"><option value="included">{{ t("Есепке қосылады") }}</option><option value="review">{{ t("Нақтылау керек — қосылмайды") }}</option><option value="duplicate">{{ t("Қайталама / есептен тыс — қосылмайды") }}</option></select></label>
      <label class="form-field wide">{{ t("Дереккөз") }}<input v-model="form.source" maxlength="1000" :placeholder="t('Чек, шот, Meta Ads есебі…')"></label>
      <label class="form-field wide">{{ t("Түсіндірме") }}<textarea v-model="form.note" rows="3" maxlength="3000" /></label>
      <p v-if="error" class="finance-error form-field wide" role="alert">{{ error }}</p>
      <div class="modal-actions form-field wide">
        <button v-if="entry.origin === 'manual'" type="button" class="button ghost danger-text" :disabled="saving" @click="remove"><Trash2 :size="16" /> {{ t("Өшіру") }}</button>
        <button type="button" class="button ghost" :disabled="saving" @click="emit('close')">{{ t("Болдырмау") }}</button>
        <button class="button primary" :disabled="saving">{{ saving ? t("Сақталуда…") : t("Сақтау") }}</button>
      </div>
    </form>
  </UiModal>
</template>
