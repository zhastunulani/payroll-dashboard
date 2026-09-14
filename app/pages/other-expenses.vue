<script setup lang="ts">
// One-time expenses now live on the Шығындар page, tab «Басқа шығындар»; old links keep working.
definePageMeta({
  redirect: to => ({ path: "/expenses", query: { ...to.query, tab: "other" }, hash: to.hash }),
});
</script>

<template>
  <div />
</template>
