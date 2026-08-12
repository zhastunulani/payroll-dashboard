<script setup lang="ts">
import { Check, ChevronDown, Search, X } from "lucide-vue-next";

type Option = { value: string; label: string; description?: string; keywords?: string };
const props = withDefaults(defineProps<{
  modelValue: string;
  options: Option[];
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}>(), { label: "", placeholder: "Таңдаңыз", searchPlaceholder: "Іздеу" });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const open = ref(false);
const query = ref("");
const root = ref<HTMLElement | null>(null);

const selected = computed(() => props.options.find(option => option.value === props.modelValue));
const filtered = computed(() => {
  const search = query.value.trim().toLocaleLowerCase("kk-KZ");
  if (!search) return props.options;
  return props.options.filter(option => `${option.label} ${option.description || ""} ${option.keywords || ""}`.toLocaleLowerCase("kk-KZ").includes(search));
});

function choose(value: string) {
  emit("update:modelValue", value);
  open.value = false;
  query.value = "";
}
function closeOnOutside(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("mousedown", closeOnOutside));
onBeforeUnmount(() => document.removeEventListener("mousedown", closeOnOutside));
</script>

<template>
  <div ref="root" class="smart-select" :class="{ open, disabled }">
    <button type="button" class="smart-select-trigger" :disabled="disabled" @click="open = !open">
      <span><small v-if="label">{{ label }}</small><strong>{{ selected?.label || placeholder }}</strong></span>
      <ChevronDown :size="17" />
    </button>
    <div v-if="open" class="smart-select-menu">
      <div class="mobile-sheet-title"><strong>{{ label || "Таңдау" }}</strong><button type="button" @click="open = false"><X :size="19" /></button></div>
      <label class="smart-select-search"><Search :size="16" /><input v-model="query" :placeholder="searchPlaceholder" autofocus /></label>
      <div class="smart-select-options">
        <button v-for="option in filtered" :key="option.value" type="button" :class="{ selected: option.value === modelValue }" @click="choose(option.value)">
          <span><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span>
          <Check v-if="option.value === modelValue" :size="17" />
        </button>
        <p v-if="!filtered.length">Сәйкес нәтиже табылмады</p>
      </div>
    </div>
    <div v-if="open" class="smart-select-scrim" @click="open = false" />
  </div>
</template>
