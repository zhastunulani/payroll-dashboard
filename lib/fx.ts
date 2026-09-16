/**
 * Official ₸ exchange rates from the National Bank of Kazakhstan.
 *
 * Meta bills in dollars; the dashboard reports in ₸. A single rate for a whole year would be badly
 * wrong — the official USD rate moved from about 505 ₸ in January 2026 to about 448 ₸ in September —
 * so every day's spend is converted at that day's official rate. This is also the source the owner's
 * own Excel report used.
 */

const ENDPOINT = "https://nationalbank.kz/rss/get_rates.cfm";

/** DD.MM.YYYY, which is the only format the National Bank accepts. */
export function nbkDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

export interface FxRate {
  day: string;
  currency: string;
  rate: number;
  source: string;
}

/** Pulls one currency's rate out of the National Bank's XML. */
export function parseNbkRates(xml: string, currency = "USD"): { rate: number; date: string } | null {
  const date = /<date>\s*([\d.]+)\s*<\/date>/.exec(xml)?.[1] ?? "";
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = item[1] ?? "";
    if (!new RegExp(`<title>\\s*${currency}\\s*</title>`).test(block)) continue;
    const raw = /<description>\s*([\d.,]+)\s*<\/description>/.exec(block)?.[1];
    const quant = Number(/<quant>\s*(\d+)\s*<\/quant>/.exec(block)?.[1] ?? "1") || 1;
    const rate = Number(raw?.replace(",", "."));
    // Some currencies are quoted per 100 units; divide so the rate is always per single unit.
    return Number.isFinite(rate) && rate > 0 ? { rate: Math.round((rate / quant) * 10000) / 10000, date } : null;
  }
  return null;
}

export interface FxFetchOptions {
  fetchImpl?: typeof fetch;
  deadline?: number;
}

/**
 * The official rate for one day. On a weekend or holiday the National Bank serves the previous
 * working day's rate, which is what actually applies, so no special handling is needed.
 */
export async function nbkRate(day: string, currency = "USD", options: FxFetchOptions = {}): Promise<FxRate | null> {
  if (options.deadline && Date.now() > options.deadline) return null;
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${ENDPOINT}?fdate=${nbkDate(day)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await doFetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseNbkRates(await response.text(), currency);
      // A date with no published rate (a future date) is not an error: there simply is no rate yet.
      return parsed ? { day, currency, rate: parsed.rate, source: "Қазақстан Ұлттық Банкі" } : null;
    } catch {
      if (attempt === 3) return null;
      await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
    }
  }
  return null;
}

/** Rates for several days, fetched a few at a time so the National Bank is not hammered. */
export async function nbkRates(days: string[], currency = "USD", options: FxFetchOptions = {}): Promise<FxRate[]> {
  const out: FxRate[] = [];
  const unique = [...new Set(days)].sort();
  for (let i = 0; i < unique.length; i += 4) {
    if (options.deadline && Date.now() > options.deadline) break;
    const batch = await Promise.all(unique.slice(i, i + 4).map(day => nbkRate(day, currency, options)));
    for (const rate of batch) if (rate) out.push(rate);
  }
  return out;
}

/**
 * The day → rate lookup the conversion uses: a month the owner priced by hand wins for every day in
 * that month; otherwise the National Bank's rate for that day applies.
 */
export function rateLookup(
  daily: { day: string; rate: number }[],
  monthly: { period: string; rate: number }[],
): (day: string) => number | null {
  const byDay = new Map(daily.map(r => [r.day, r.rate]));
  const byMonth = new Map(monthly.map(r => [r.period, r.rate]));
  return (day: string) => byMonth.get(day.slice(0, 7)) ?? byDay.get(day) ?? null;
}

/**
 * Converts day-by-day, each at its own rate. Returns null when any day is missing a rate, because a
 * partial total would understate the spend and look like a real number.
 */
export function convertDaily(
  rows: { date: string; amount: number }[],
  rateOf: (day: string) => number | null,
): { total: number; rate: number | null; missing: string[] } | null {
  if (!rows.length) return null;
  const missing = [...new Set(rows.filter(r => rateOf(r.date) === null).map(r => r.date))].sort();
  if (missing.length) return { total: 0, rate: null, missing };
  const total = rows.reduce((a, r) => a + r.amount * rateOf(r.date)!, 0);
  const amount = rows.reduce((a, r) => a + r.amount, 0);
  return {
    total: Math.round(total),
    // The effective rate: what the whole window worked out at, weighted by each day's spend.
    rate: amount > 0 ? Math.round((total / amount) * 100) / 100 : null,
    missing: [],
  };
}
