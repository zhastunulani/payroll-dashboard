<script setup lang="ts">
import { CheckCircle2, FileUp, TriangleAlert, X } from "lucide-vue-next";
import { ASSIGNMENT_LABELS, BANK_FORMATS, BANK_LABELS, type BankCode } from "../../lib/bank";
import type { BankUploadResult } from "../../lib/bank-database";

const props = defineProps<{ projectName: (id: string | null) => string; embedded?: boolean }>();
const emit = defineEmits<{ done: [message: string] }>();
const bank = useBank();
const { t } = useLocale();
const choice = ref<BankCode>("kaspi");
const file = ref<File | null>(null);
const preview = ref<BankUploadResult | null>(null);
const busy = ref(false), dragging = ref(false), error = ref(""), done = ref("");
const input = ref<HTMLInputElement>();

function take(next: File | undefined) {
  if (!next) return;
  file.value = next;
  preview.value = null;
  error.value = "";
  done.value = "";
  // The file type tells the bank; the owner can still change it.
  if (/\.pdf$/i.test(next.name)) choice.value = "halyk";
  else if (/\.xlsx?$/i.test(next.name)) choice.value = "kaspi";
}
function onDrop(event: DragEvent) {
  dragging.value = false;
  take(event.dataTransfer?.files?.[0]);
}
function reset() {
  file.value = null;
  preview.value = null;
  if (input.value) input.value.value = "";
}
async function check() {
  if (!file.value) return;
  busy.value = true; error.value = ""; done.value = "";
  try {
    preview.value = await bank.upload(choice.value, file.value, false);
  } catch (e) {
    error.value = messageOf(e, t("Файл тексерілмеді."));
  } finally {
    busy.value = false;
  }
}
async function commit(force = false) {
  if (!file.value) return;
  if (force && !confirm(t("Файлдағы итогтар операциялармен сәйкес келмейді. Операциялар «Тексеру керек» күйінде импортталады және ешбір жобаның есебіне өздігінен кірмейді. Жалғастыру керек пе?"))) return;
  busy.value = true; error.value = "";
  try {
    const result = await bank.upload(choice.value, file.value, true, force);
    done.value = `${result.fresh} ${t("операция импортталды")}${result.duplicates ? `, ${result.duplicates} ${t("бұрын жүктелгені өткізілді")}` : ""}.`;
    reset();
    emit("done", done.value);
  } catch (e) {
    error.value = messageOf(e, t("Импорт орындалмады."));
  } finally {
    busy.value = false;
  }
}
const day = (iso: string | null) => iso ? iso.split("-").reverse().join(".") : "—";
const groupLabel = (g: BankUploadResult["groups"][number]) =>
  g.assignment === "auto" || g.assignment === "manual" ? props.projectName(g.projectId)
    : g.assignment === "unknown" ? `${t(ASSIGNMENT_LABELS.unknown)} (${t("ұсыныс")}: ${props.projectName(g.suggestedProjectId)})` : t(ASSIGNMENT_LABELS[g.assignment]);
</script>

<template>
  <section class="bank-upload" :class="{ panel: !embedded }">
    <header v-if="!embedded"><div><span class="eyebrow">{{ t("Жаңа выписка") }}</span><h2>{{ t("Выписка жүктеу") }}</h2></div></header>
    <ol v-if="embedded" class="bank-steps"><li>{{ t("Банкті таңдап, файлды салыңыз") }}</li><li>{{ t("«Тексеру» — файлдағы итогтармен салыстырамыз, ештеңе сақталмайды") }}</li><li>{{ t("«Импорттау» — операциялар жобаларға бөлінеді") }}</li></ol>
    <div class="segmented bank-choice" role="group" aria-label="Банк">
      <button v-for="code in (['kaspi', 'halyk'] as const)" :key="code" type="button" :class="{ active: choice === code }" @click="choice = code; preview = null">
        {{ BANK_LABELS[code] }} <b>.{{ BANK_FORMATS[code].ext }}</b>
      </button>
    </div>
    <label class="drop-zone" :class="{ dragging, filled: file }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
      <input ref="input" type="file" :accept="BANK_FORMATS[choice].accept" @change="take(($event.target as HTMLInputElement).files?.[0])">
      <FileUp :size="22" />
      <span v-if="file"><strong>{{ file.name }}</strong><small>{{ (file.size / 1024).toFixed(0) }} КБ · {{ BANK_LABELS[choice] }}</small></span>
      <span v-else><strong>{{ t("Файлды осында сүйреңіз немесе таңдаңыз") }}</strong><small>{{ BANK_FORMATS[choice].hint }}</small></span>
    </label>
    <div class="bank-upload-actions">
      <button class="button primary" type="button" :disabled="!file || busy" @click="check">{{ busy && !preview ? t("Тексерілуде…") : t("Тексеру") }}</button>
      <button v-if="file" class="button ghost" type="button" :disabled="busy" @click="reset"><X :size="16" /> {{ t("Бас тарту") }}</button>
    </div>
    <p v-if="error" class="finance-error" role="alert">{{ error }}</p>
    <p v-if="done" class="bank-done" role="status"><CheckCircle2 :size="16" /> {{ done }}</p>

    <div v-if="preview" class="bank-preview">
      <dl class="stat-pairs">
        <div><dt>{{ t("Заңды тұлға") }}</dt><dd>{{ preview.legalEntity || "—" }}</dd></div>
        <div><dt>{{ t("БСН / ЖСН") }}</dt><dd>{{ preview.legalEntityBin || "—" }}</dd></div>
        <div v-if="preview.account"><dt>{{ t("Шот") }}</dt><dd>{{ preview.account }}</dd></div>
        <div><dt>{{ t("Кезең") }}</dt><dd>{{ day(preview.periodFrom) }} — {{ day(preview.periodTo) }}</dd></div>
        <div><dt>{{ t("Операциялар") }}</dt><dd>{{ preview.total }} · {{ t("жаңасы") }} {{ preview.fresh }}<template v-if="preview.duplicates"> · {{ t("бұрын жүктелген") }} {{ preview.duplicates }}</template></dd></div>
      </dl>
      <ul class="bank-checks">
        <li v-for="c in preview.checks" :key="c.label" :class="c.ok ? 'ok' : 'bad'">
          <CheckCircle2 v-if="c.ok" :size="15" /><TriangleAlert v-else :size="15" />
          <span>{{ c.label }}</span><b>{{ money(c.expected) }}</b><small v-if="!c.ok">{{ t("операциялар бойынша") }} {{ money(c.actual) }}</small>
        </li>
        <li v-if="!preview.checks.length" class="bad"><TriangleAlert :size="15" /><span>{{ t("Файлда тексеретін итог жоқ") }}</span></li>
      </ul>
      <p v-for="w in preview.warnings.slice(0, 3)" :key="w" class="bank-warning">{{ w }}</p>
      <table class="bank-mini-table">
        <thead><tr><th>{{ t("Қайда түседі") }}</th><th>{{ t("Операция") }}</th><th>{{ t("Түсім") }}</th></tr></thead>
        <tbody><tr v-for="g in preview.groups" :key="`${g.assignment}${g.projectId}${g.suggestedProjectId}`" :class="{ waiting: g.assignment === 'review' || g.assignment === 'unknown' }"><td>{{ groupLabel(g) }}</td><td>{{ g.count }}</td><td>{{ money(g.amount) }}</td></tr></tbody>
      </table>
      <p v-if="preview.review.length" class="bank-warning">{{ t("Жобасы анықталмаған операциялар импорттан кейін «Бөлу керек» тізімінде тұрады: мекенжай немесе шарт бойынша бір рет жобаны таңдайсыз. Оған дейін ешбір жобаның есебіне кірмейді.") }}</p>
      <div class="bank-upload-actions">
        <button v-if="preview.checksOk" class="button primary" type="button" :disabled="busy || !preview.fresh" @click="commit()">{{ busy ? t("Импортталуда…") : t("{n} операцияны импорттау").replace("{n}", String(preview.fresh)) }}</button>
        <button v-else class="button secondary danger-text" type="button" :disabled="busy || !preview.fresh" @click="commit(true)">{{ t("Бәрібір импорттау (тексеруге)") }}</button>
      </div>
    </div>
  </section>
</template>
