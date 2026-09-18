<script setup lang="ts">
import { BriefcaseBusiness, Check, ChevronsUpDown, Plus } from "lucide-vue-next";

const payroll = usePayroll();
const ctx = useAppContext();
const { t } = useLocale();
const open = ref(false);
const createOpen = ref(false);
const name = ref("");
const root = ref<HTMLElement | null>(null);

function closeOnOutside(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener("click", closeOnOutside));
onBeforeUnmount(() => document.removeEventListener("click", closeOnOutside));

async function select(id: string) {
  open.value = false;
  await payroll.switchWorkspace(id);
}

async function createWorkspace() {
  const normalized = name.value.trim();
  if (!normalized) return;
  if (await payroll.mutate("createWorkspace", { name: normalized })) {
    name.value = "";
    createOpen.value = false;
    open.value = false;
  }
}
</script>

<template>
  <div ref="root" class="workspace-switcher sidebar-workspace-switcher">
    <button class="workspace-trigger" type="button" :aria-expanded="open" :aria-label="t('Жобаны ауыстыру')" @click.stop="open = !open">
      <span class="workspace-trigger-copy">
        <strong><i class="switcher-dot" :style="{ background: ctx.workspaceColor.value }" />{{ payroll.data.value?.selectedWorkspace.name || "EdUser" }}</strong>
      </span>
      <ChevronsUpDown :size="16" />
    </button>

    <div v-if="open" class="workspace-menu" @click.stop>
      <header>
        <span><strong>{{ t("Жобалар") }}</strong></span>
        <BriefcaseBusiness :size="16" />
      </header>
      <div class="workspace-options">
        <button v-for="item in payroll.data.value?.workspaces" :key="item.id" type="button" :class="{ active: item.id === payroll.data.value?.selectedWorkspace.id }" @click="select(item.id)">
          <span><strong><i class="switcher-dot" :style="{ background: ctx.colorOf(item.id) }" />{{ item.name }}</strong></span>
          <Check v-if="item.id === payroll.data.value?.selectedWorkspace.id" :size="17" />
        </button>
      </div>
      <button class="workspace-create" type="button" @click="createOpen = true; open = false"><Plus :size="15" /><span><strong>{{ t("Жаңа жоба") }}</strong></span></button>
    </div>
  </div>

  <UiModal v-if="createOpen" :title="t('Жаңа жоба')" :description="t('Бұл жоба жеке айлық қоры, бөлімдер және шығындармен ашылады')" @close="createOpen = false">
    <form class="form-stack" @submit.prevent="createWorkspace">
      <label class="form-field"><span>{{ t("Жоба атауы") }}</span><input v-model="name" autofocus maxlength="80" :placeholder="t('Мысалы: Eduser Academy')" required /></label>
      <div class="workspace-create-preview"><span class="workspace-option-mark">{{ (name.trim() || t("Жаңа жоба")).slice(0, 1).toUpperCase() }}</span><div><strong>{{ name.trim() || t("Жаңа жоба") }}</strong><small>{{ t("Бос ағымдағы ай және стандартты бөлімдер") }}</small></div></div>
      <div class="modal-actions"><button type="button" class="button ghost" @click="createOpen = false">{{ t("Болдырмау") }}</button><button class="button primary" :disabled="payroll.saving.value || !name.trim()">{{ payroll.saving.value ? t("Құрылуда…") : t("Жобаны құру") }}</button></div>
    </form>
  </UiModal>
</template>
