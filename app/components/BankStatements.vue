<script setup lang="ts">
import { CheckCircle2, Download, Trash2, TriangleAlert } from "lucide-vue-next";
import { BANK_LABELS } from "../../lib/bank";
import type { BankStatementInfo } from "../../lib/bank-database";

defineProps<{ statements: BankStatementInfo[] }>();
const bank = useBank();
const error = ref("");
const day = (iso: string | null) => iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—";

async function remove(s: BankStatementInfo) {
  if (!confirm(`«${s.fileName}» жүктеуі және оның ${s.operationsCount} операциясы өшіріледі. Есептер қайта есептеледі. Жалғастыру керек пе?`)) return;
  try {
    await bank.deleteStatement(s.id);
  } catch (e) {
    error.value = messageOf(e, "Өшіру орындалмады.");
  }
}
</script>

<template>
  <section class="panel bank-history">
    <header><div><span class="eyebrow">Тарих</span><h2>Жүктеулер</h2></div><small class="panel-note">{{ statements.length }} файл</small></header>
    <p v-if="error" class="finance-error" role="alert">{{ error }}</p>
    <p v-if="!statements.length" class="panel-empty">Әзірге выписка жүктелмеген.</p>
    <ul v-else class="bank-statement-list">
      <li v-for="s in statements" :key="s.id">
        <span class="bank-badge" :class="s.bank">{{ BANK_LABELS[s.bank] }}</span>
        <div>
          <strong>{{ s.legalEntity || s.fileName }}</strong>
          <small>{{ day(s.periodFrom) }} — {{ day(s.periodTo) }} · {{ s.operationsCount }} операция<template v-if="s.duplicatesSkipped"> · {{ s.duplicatesSkipped }} қайталанған өткізілді</template></small>
          <small class="muted">{{ s.fileName }} · жүктелді {{ s.uploadedAt.slice(0, 16).replace("T", " ") }}</small>
        </div>
        <span v-if="s.status === 'ok'" class="bank-status ok" title="Файлдағы итогтар операциялармен сәйкес"><CheckCircle2 :size="14" /> Итогтар сәйкес</span>
        <span v-else class="bank-status bad" title="Итогтар сәйкес келмеді; операциялар тексеруде"><TriangleAlert :size="14" /> Сәйкес емес</span>
        <a class="icon-button" :href="`/api/bank/file?id=${s.id}`" :aria-label="`${s.fileName}: бастапқы файлды жүктеп алу`"><Download :size="16" /></a>
        <button class="icon-button danger" type="button" :aria-label="`${s.fileName}: жүктеуді өшіру`" @click="remove(s)"><Trash2 :size="16" /></button>
      </li>
    </ul>
  </section>
</template>
