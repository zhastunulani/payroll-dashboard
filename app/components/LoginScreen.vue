<script setup lang="ts">
import { ArrowRight, LockKeyhole, ShieldCheck, WalletCards } from "lucide-vue-next";

const payroll = usePayroll();
const { t } = useLocale();
const password = ref("");
const submitting = ref(false);
const message = ref("");

async function login() {
  submitting.value = true;
  message.value = "";
  try {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { password: password.value },
      credentials: "include",
    });
    await payroll.load();
  } catch (caught) {
    const error = caught as Error & { data?: { error?: string } };
    message.value = error.data?.error || t("Кіру мүмкін болмады.");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-story">
      <div class="login-brand"><span>A</span><strong>Айлық</strong></div>
      <div class="login-message">
        <span class="eyebrow light">{{ t("Қаржыны анық басқарыңыз") }}</span>
        <h1>{{ t("Айлық пен шығындар.") }}<br><em>{{ t("Бір түсінікті жүйеде.") }}</em></h1>
        <p>{{ t("Жоспар, нақты төлем және ай сайынғы өзгеріс — шешім қабылдауға дайын түрде.") }}</p>
      </div>
      <div class="login-proof">
        <span><ShieldCheck :size="18" /> {{ t("Қауіпсіз сессия") }}</span>
        <span><WalletCards :size="18" /> {{ t("Neon дерекқоры") }}</span>
      </div>
    </section>

    <section class="login-panel">
      <form @submit.prevent="login">
        <span class="login-lock"><LockKeyhole :size="22" /></span>
        <span class="eyebrow">{{ t("Қош келдіңіз") }}</span>
        <h2>{{ t("Жүйеге кіру") }}</h2>
        <p>{{ t("Қаржылық деректерді ашу үшін ортақ парольді енгізіңіз.") }}</p>
        <label>
          <span>{{ t("Пароль") }}</span>
          <input v-model="password" type="password" autocomplete="current-password" :placeholder="t('Парольді енгізіңіз')" autofocus required />
        </label>
        <div v-if="message" class="form-alert">{{ message }}</div>
        <button class="button primary wide" :disabled="submitting">
          {{ submitting ? t("Тексерілуде…") : t("Кіру") }} <ArrowRight :size="18" />
        </button>
        <small>{{ t("Қолжетімділік HttpOnly cookie арқылы қорғалған") }}</small>
      </form>
    </section>
  </main>
</template>
