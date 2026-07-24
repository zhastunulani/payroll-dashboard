const MONTH_ID_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function addMonths(monthId: string, offset: number): string {
  const match = MONTH_ID_PATTERN.exec(monthId);
  if (!match) throw new Error("Ай форматы YYYY-MM болуы керек.");

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextAvailableMonthId(
  selectedMonthId: string,
  existingMonthIds: string[],
): string {
  const existing = new Set(existingMonthIds);
  let candidate = addMonths(selectedMonthId, 1);

  while (existing.has(candidate)) {
    candidate = addMonths(candidate, 1);
  }

  return candidate;
}
