<script setup lang="ts">
import { Building2, Calculator, Check, ChevronDown, Landmark, LayoutDashboard, LogOut, Moon, Network, ReceiptText, Settings2, Sun, UsersRound, X } from "lucide-vue-next";

const payroll = usePayroll();
const ctx = useAppContext();
const route = useRoute();
const { locale, setLocale, t, locales } = useLocale();
const { theme, setTheme, toggle: toggleTheme } = useTheme();
// The button shows the language it is on and switches to the other one.
const nextLocale = computed(() => locales.find(l => l.id !== locale.value) ?? locales[0]!);
// Reports cover all projects; Payroll operations work inside the profile chosen below.
const links = [
  { to: "/", label: "Қаржылық шолу", short: "Шолу", icon: LayoutDashboard, group: "analytics" },
  { to: "/finance", label: "Жоба P&L", short: "P&L", icon: Building2, group: "analytics" },
  { to: "/unit-economics", label: "Юнит және таргет", short: "Юнит", icon: Calculator, group: "analytics" },
  { to: "/bank", label: "Банк выпискалары", short: "Банк", icon: Landmark, group: "analytics" },
  { to: "/departments", label: "Айлық төлемі", short: "Айлық", icon: UsersRound, group: "payroll" },
  { to: "/expenses", label: "Шығындар", short: "Шығын", icon: ReceiptText, group: "payroll" },
  { to: "/smz", label: "SMZ бөлу", short: "SMZ", icon: Network, group: "payroll" },
  { to: "/settings", label: "Баптаулар", short: "Баптау", icon: Settings2, group: "payroll" },
];
const groups = ["analytics", "payroll"].map(name => ({ name, links: links.filter(link => link.group === name) }));
const isActive = (to: string) => route.path === to || (to === "/expenses" && route.path === "/other-expenses");

/**
 * The sidebar keeps its groups folded. Eight links open at once made the finance section a wall of
 * text, so only the group holding the current page opens by default, and the choice is remembered.
 */
const openGroups = useCookie<string[]>("payroll_nav_open", {
  sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  default: () => [],
});
const currentGroup = computed(() => links.find(l => isActive(l.to))?.group ?? "analytics");
const isOpen = (name: string) => (openGroups.value?.length ? openGroups.value.includes(name) : name === currentGroup.value);
function toggleGroup(name: string) {
  const open = new Set(openGroups.value?.length ? openGroups.value : [currentGroup.value]);
  if (open.has(name)) open.delete(name);
  else open.add(name);
  // An empty list would mean «follow the current page» again, so a deliberate all-closed state is kept.
  openGroups.value = open.size ? [...open] : ["none"];
}
// Opening a page inside a folded group unfolds it, so the active link is never hidden.
watch(currentGroup, name => {
  if (openGroups.value?.length && !openGroups.value.includes(name)) openGroups.value = [...openGroups.value, name];
});

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

onMounted(() => {
  document.documentElement.lang = locale.value;
  // The cookie is read during setup; this writes it onto <html> so the stylesheets pick it up.
  setTheme(theme.value);
});
onBeforeUnmount(stopSettingsHold);
</script>

<template>
  <aside class="app-sidebar">
    <NuxtLink to="/" class="app-logo"><span>A</span><div><strong>Айлық</strong><small>Finance OS</small></div></NuxtLink>
    <nav>
      <template v-for="group in groups" :key="group.name">
        <button
          type="button" class="nav-group" :class="{ open: isOpen(group.name) }"
          :aria-expanded="isOpen(group.name)" :title="isOpen(group.name) ? t('Бөлімді жию') : t('Бөлімді ашу')"
          :style="group.name === 'payroll' ? { '--project': ctx.workspaceColor.value } : undefined"
          @click="toggleGroup(group.name)"
        >
          <i v-if="group.name === 'payroll'" class="nav-project-dot" />
          <span>{{ group.name === "analytics" ? t("Талдау · барлық жоба") : `Payroll · ${ctx.workspace.value?.name || t("жоба")}` }}</span>
          <ChevronDown :size="14" />
        </button>
        <div v-show="isOpen(group.name)" class="nav-group-links">
          <NuxtLink v-for="link in group.links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }">
            <component :is="link.icon" :size="19" /><span>{{ t(link.label) }}</span>
          </NuxtLink>
        </div>
      </template>
    </nav>
    <WorkspaceSwitcher />
    <div class="sidebar-foot">
      <button class="sidebar-logout" type="button" @click="payroll.logout"><LogOut :size="18" /> {{ t("Шығу") }}</button>
      <div class="sidebar-toggles">
        <!-- Two one-tap switches rather than two labelled controls: they are set once and then forgotten. -->
        <button type="button" :title="nextLocale.label" :aria-label="nextLocale.label" @click="setLocale(nextLocale.id)">
          <span class="locale-mark">{{ locales.find(l => l.id === locale)?.short }}</span>
        </button>
        <button type="button" :title="t(theme === 'dark' ? 'Жарық режим' : 'Қараңғы режим')" :aria-label="t(theme === 'dark' ? 'Жарық режим' : 'Қараңғы режим')" @click="toggleTheme">
          <component :is="theme === 'dark' ? Sun : Moon" :size="16" />
        </button>
      </div>
    </div>
  </aside>

  <nav class="mobile-navigation" :aria-label="t('Негізгі навигация')">
    <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link.to) }" @pointerdown="startSettingsHold(link.to)" @pointerup="stopSettingsHold" @pointercancel="stopSettingsHold" @pointerleave="stopSettingsHold" @contextmenu.prevent @click="handleNavigationClick($event, link.to)">
      <component :is="link.icon" :size="20" /><span>{{ t(link.short) }}</span>
    </NuxtLink>
  </nav>

  <div v-if="projectSheetOpen" class="project-sheet-backdrop" @click.self="projectSheetOpen = false">
    <section class="project-sheet" role="dialog" aria-modal="true" :aria-label="t('Жобаны ауыстыру')">
      <header><div><span class="eyebrow">{{ t("Жұмыс кеңістігі") }}</span><h2>{{ t("Жобаны таңдаңыз") }}</h2></div><button type="button" :aria-label="t('Жабу')" @click="projectSheetOpen = false"><X :size="18" /></button></header>
      <div class="project-sheet-options">
        <button v-for="workspace in payroll.data.value?.workspaces" :key="workspace.id" type="button" :class="{ active: workspace.id === payroll.data.value?.selectedWorkspace.id }" :disabled="payroll.loading.value" @click="selectWorkspace(workspace.id)">
          <span><strong>{{ workspace.name }}</strong><small>{{ workspace.id === payroll.data.value?.selectedWorkspace.id ? t("Қазір ашық") : t("Ауыстыру") }}</small></span>
          <Check v-if="workspace.id === payroll.data.value?.selectedWorkspace.id" :size="18" />
        </button>
      </div>
      <p>{{ t("Бұл терезені ашу үшін «Баптау» батырмасын ұзақ басыңыз.") }}</p>
    </section>
  </div>
</template>
