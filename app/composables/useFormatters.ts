export function useFormatters() {
  const moneyFormatter = new Intl.NumberFormat("kk-KZ", {
    maximumFractionDigits: 0,
  });

  const formatMoney = (amount: number) => `${moneyFormatter.format(Math.round(amount))} ₸`;
  const formatCompact = (amount: number) => {
    if (Math.abs(amount) >= 1_000_000) {
      return `${new Intl.NumberFormat("kk-KZ", { maximumFractionDigits: 1 }).format(amount / 1_000_000)} млн ₸`;
    }
    return formatMoney(amount);
  };
  const percentChange = (current: number, previous?: number) => {
    if (previous === undefined || previous === 0) return current === 0 ? 0 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  return { formatMoney, formatCompact, percentChange };
}
