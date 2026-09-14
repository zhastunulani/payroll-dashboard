<script setup lang="ts">
const payroll = usePayroll();
const route = useRoute();

onMounted(() => {
  // A link from the reports (?workspace=&month=) opens that payroll profile and month directly.
  const workspace = typeof route.query.workspace === "string" ? route.query.workspace : undefined;
  const month = typeof route.query.month === "string" && PAYROLL_ROUTES.has(route.path) ? route.query.month : undefined;
  payroll.load(month, workspace);
});
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
