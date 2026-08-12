<script setup lang="ts">
import { X } from "lucide-vue-next";

defineProps<{ title: string; description?: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

onMounted(() => document.body.classList.add("modal-open"));
onBeforeUnmount(() => document.body.classList.remove("modal-open"));
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @mousedown.self="emit('close')">
      <section class="modal-card" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
        <header>
          <div><span class="eyebrow">Деректерді басқару</span><h2>{{ title }}</h2><p v-if="description">{{ description }}</p></div>
          <button class="icon-button" type="button" aria-label="Жабу" @click="emit('close')"><X :size="20" /></button>
        </header>
        <div class="modal-body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>
