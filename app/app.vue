<script setup lang="ts">
const payroll = usePayroll();

onMounted(() => payroll.load());
</script>

<template>
  <NuxtPage v-slot="{ Component }">
    <main v-if="payroll.authenticated.value === null" class="boot-screen">
      <div class="brand-symbol">A</div>
      <div class="boot-copy">
        <strong>Қаржылық жүйе ашылуда</strong>
        <span>Айлық деректері жүктеліп жатыр…</span>
      </div>
      <div class="boot-progress"><i /></div>
    </main>

    <LoginScreen v-else-if="!payroll.authenticated.value" />

    <AppShell v-else>
      <component :is="Component" />
    </AppShell>
  </NuxtPage>
</template>
