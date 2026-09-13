<script setup lang="ts">
import { Building2, Calculator, Check, LayoutDashboard, LogOut, Network, ReceiptText, Settings2, ShoppingBag, UsersRound, X } from "lucide-vue-next";

const payroll = usePayroll();
const route = useRoute();
const links = [
  { to: "/", label: "Қаржылық шолу", short: "Шолу", icon: LayoutDashboard, group: "Талдау" },
  { to: "/finance", label: "Жоба P&L", short: "P&L", icon: Building2, group: "Талдау" },
  { to: "/unit-economics", label: "Юнит және таргет", short: "Юнит", icon: Calculator, group: "Талдау" },
  { to: "/departments", label: "Айлық · бөлімдер", short: "Айлық", icon: UsersRound, group: "Payroll операциялары" },
  { to: "/expenses", label: "Тұрақты шығындар", short: "Шығын", icon: ReceiptText, group: "Payroll операциялары" },
  { to: "/other-expenses", label: "Басқа шығындар", short: "Реестр", icon: ShoppingBag, group: "Payroll операциялары" },
  { to: "/smz", label: "SMZ бөлу", short: "SMZ", icon: Network, group: "Payroll операциялары" },
  { to: "/settings", label: "Баптаулар", short: "Баптау", icon: Settings2, group: "Payroll операциялары" },
];
const groups = [...new Set(links.map(link => link.group))].map(name => ({ name, links: links.filter(link => link.group === name) }));
const projectSheetOpen = ref(false);
const longPressTriggered = ref(false);
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function startSettingsHold(to: string) {
  if (to !== "/settings" || !window.matchMedia("(max-width: 900px)").matches) return;
  longPressTriggered.value = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered.value = true;
    projectSheetOpen.value = true;
  }, 520);
}

function stopSettingsHold() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
}

function handleNavigationClick(event: MouseEvent, to: string) {
  stopSettingsHold();
  if (to !== "/settings" || !longPressTriggered.value) return;
  event.preventDefault();
  event.stopPropagation();
  requestAnimationFrame(() => { longPressTriggered.value = false; });
}

async function selectWorkspace(id: string) {
  projectSheetOpen.value = false;
  if (id !== payroll.data.value?.selectedWorkspace.id) await payroll.switchWorkspace(id);
}

onBeforeUnmount(stopSettingsHold);
</script>

<template>
  <aside class="app-sidebar">
    <NuxtLink to="/" class="app-logo"><span>A</span><div><strong>Айлық</strong><small>Finance OS</small></div></NuxtLink>
    <nav>
      <template v-for="group in groups" :key="group.name">
        <span class="nav-caption">{{ group.name }}</span>
        <NuxtLink v-for="link in group.links" :key="link.to" :to="link.to" :class="{ active: route.path === link.to }">
          <component :is="link.icon" :size="19" /><span>{{ link.label }}</span>
        </NuxtLink>
      </template>
    </nav>
    <div class="sidebar-status">
      <i /><span><strong>Жүйе жұмыс істеп тұр</strong><small>Деректер синхрондалды</small></span>
    </div>
    <WorkspaceSwitcher />
    <button class="sidebar-logout" type="button" @click="payroll.logout"><LogOut :size="18" /> Шығу</button>
  </aside>

  <nav class="mobile-navigation" aria-label="Негізгі навигация">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: route.path === link.to }" @pointerdown="startSettingsHold(link.to)" @pointerup="stopSettingsHold" @pointercancel="stopSettingsHold" @pointerleave="stopSettingsHold" @contextmenu.prevent @click="handleNavigationClick($event, link.to)">
      <component :is="link.icon" :size="20" /><span>{{ link.short }}</span>
    </NuxtLink>
  </nav>

  <div v-if="projectSheetOpen" class="project-sheet-backdrop" @click.self="projectSheetOpen = false">
    <section class="project-sheet" role="dialog" aria-modal="true" aria-label="Жобаны ауыстыру">
      <header><div><span class="eyebrow">Жұмыс кеңістігі</span><h2>Жобаны таңдаңыз</h2></div><button type="button" aria-label="Жабу" @click="projectSheetOpen = false"><X :size="18" /></button></header>
      <div class="project-sheet-options">
        <button v-for="workspace in payroll.data.value?.workspaces" :key="workspace.id" type="button" :class="{ active: workspace.id === payroll.data.value?.selectedWorkspace.id }" :disabled="payroll.loading.value" @click="selectWorkspace(workspace.id)">
          <span><strong>{{ workspace.name }}</strong><small>{{ workspace.id === payroll.data.value?.selectedWorkspace.id ? 'Қазір ашық' : 'Ауыстыру' }}</small></span>
          <Check v-if="workspace.id === payroll.data.value?.selectedWorkspace.id" :size="18" />
        </button>
      </div>
      <p>Бұл терезені ашу үшін «Баптау» батырмасын ұзақ басыңыз.</p>
    </section>
  </div>
</template>
