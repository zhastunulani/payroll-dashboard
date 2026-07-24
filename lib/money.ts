const MONEY_NUMBER = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  useGrouping: true,
});

function normalizeSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

export function formatMoney(value: number): string {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  return `${normalizeSpaces(MONEY_NUMBER.format(amount))} ₸`;
}

export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return normalizeSpaces(MONEY_NUMBER.format(Math.max(0, Math.round(value))));
}

export function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : 0;
}
