import { formatMoney as formatWholeMoney } from "../../lib/money";

export function useFormatters() {
  const formatMoney = (amount: number) => formatWholeMoney(amount);
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
