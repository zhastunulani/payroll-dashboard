<script setup lang="ts">
import { BriefcaseBusiness, Check, ChevronsUpDown, Plus } from "lucide-vue-next";

const payroll = usePayroll();
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
    <button class="workspace-trigger" type="button" :aria-expanded="open" @click.stop="open = !open">
      <span class="workspace-trigger-copy">
        <strong>{{ payroll.data.value?.selectedWorkspace.name || "EdUser" }}</strong>
      </span>
      <ChevronsUpDown :size="16" />
    </button>

    <div v-if="open" class="workspace-menu" @click.stop>
      <header>
        <span><strong>Жобалар</strong></span>
        <BriefcaseBusiness :size="16" />
      </header>
      <div class="workspace-options">
        <button v-for="item in payroll.data.value?.workspaces" :key="item.id" type="button" :class="{ active: item.id === payroll.data.value?.selectedWorkspace.id }" @click="select(item.id)">
          <span><strong>{{ item.name }}</strong></span>
          <Check v-if="item.id === payroll.data.value?.selectedWorkspace.id" :size="17" />
        </button>
      </div>
      <button class="workspace-create" type="button" @click="createOpen = true; open = false"><Plus :size="15" /><span><strong>Жаңа жоба</strong></span></button>
    </div>
  </div>

  <UiModal v-if="createOpen" title="Жаңа жоба" description="Бұл жоба жеке айлық қоры, бөлімдер және шығындармен ашылады" @close="createOpen = false">
    <form class="form-stack" @submit.prevent="createWorkspace">
      <label class="form-field"><span>Жоба атауы</span><input v-model="name" autofocus maxlength="80" placeholder="Мысалы: Eduser Academy" required /></label>
      <div class="workspace-create-preview"><span class="workspace-option-mark">{{ name.trim().slice(0, 1).toUpperCase() || "Ж" }}</span><div><strong>{{ name.trim() || "Жаңа жоба" }}</strong><small>Бос ағымдағы ай және стандартты бөлімдер</small></div></div>
      <div class="modal-actions"><button type="button" class="button ghost" @click="createOpen = false">Болдырмау</button><button class="button primary" :disabled="payroll.saving.value || !name.trim()">{{ payroll.saving.value ? "Құрылуда…" : "Жобаны құру" }}</button></div>
    </form>
  </UiModal>
</template>
