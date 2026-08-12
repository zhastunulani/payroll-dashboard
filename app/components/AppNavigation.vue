<script setup lang="ts">
import { LayoutDashboard, LogOut, ReceiptText, Settings2, ShoppingBag, UsersRound } from "lucide-vue-next";

const payroll = usePayroll();
const route = useRoute();
const links = [
  { to: "/", label: "Дашборд", short: "Шолу", icon: LayoutDashboard },
  { to: "/departments", label: "Бөлімдер", short: "Айлық", icon: UsersRound },
  { to: "/expenses", label: "Шығындар", short: "Шығын", icon: ReceiptText },
  { to: "/other-expenses", label: "Басқа шығындар", short: "Реестр", icon: ShoppingBag },
  { to: "/settings", label: "Баптаулар", short: "Баптау", icon: Settings2 },
];
</script>

<template>
  <aside class="app-sidebar">
    <NuxtLink to="/" class="app-logo"><span>A</span><div><strong>Айлық</strong><small>Finance OS</small></div></NuxtLink>
    <nav>
      <span class="nav-caption">Жұмыс кеңістігі</span>
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: route.path === link.to }">
        <component :is="link.icon" :size="19" /><span>{{ link.label }}</span>
      </NuxtLink>
    </nav>
    <div class="sidebar-status">
      <i /><span><strong>Жүйе жұмыс істеп тұр</strong><small>Деректер синхрондалды</small></span>
    </div>
    <WorkspaceSwitcher />
    <button class="sidebar-logout" type="button" @click="payroll.logout"><LogOut :size="18" /> Шығу</button>
  </aside>

  <nav class="mobile-navigation" aria-label="Негізгі навигация">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: route.path === link.to }">
      <component :is="link.icon" :size="20" /><span>{{ link.short }}</span>
    </NuxtLink>
  </nav>
</template>
