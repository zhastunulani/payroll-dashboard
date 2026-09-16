/**
 * Meta (Facebook / Instagram) advertising facts.
 *
 * Meta reports spending in the ad account's own currency — here USD — while the dashboard keeps money in ₸.
 * The conversion rate is never guessed: it comes from a rate the owner entered for that month, or the
 * ledger's own rate for the same month. Without a rate the ₸ figure stays null and only USD is shown.
 */

export const META_API_VERSION = "v21.0";

/** One ad account as Meta describes it, plus the project its spending belongs to. */
export interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: number;
  projectId: string | null;
  tracked: boolean;
  spendLifetime: number | null;
  firstDate: string | null;
  lastDate: string | null;
  days: number;
}

/** Account metrics for one day. Reach is the people reached that day. */
export interface MetaDay {
  accountId: string;
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversations: number;
  leads: number;
}

/** Account metrics for a whole month, as Meta aggregates them: here `reach` counts each person once. */
export interface MetaPeriod extends Omit<MetaDay, "date"> {
  period: string;
}

export interface MetaRegionDay {
  accountId: string;
  date: string;
  region: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversations: number;
}

export interface MetaSyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "ok" | "error";
  accounts: number;
  days: number;
  from: string;
  to: string;
  message: string;
}

/**
 * What the target section needs for one project-month. `spendKzt` is null when no rate is known —
 * an unknown rate must never look like zero spending.
 */
export interface MetaFacts {
  spend: number;
  spendKzt: number | null;
  fxRate: number | null;
  impressions: number;
  /** People reached, counted once — only when the window matches a period Meta itself aggregated. */
  reach: number | null;
  /** Sum of the daily reach: the same person counted again on each day they saw an ad. */
  reachDays: number;
  frequency: number | null;
  clicks: number;
  conversations: number;
  leads: number;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  costPerConversation: number | null;
  days: number;
  firstDate: string | null;
  lastDate: string | null;
  accounts: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** YYYY-MM of a YYYY-MM-DD date. */
export const metaMonth = (date: string) => date.slice(0, 7);

/** First and last day of a YYYY-MM period. */
export function metaMonthRange(period: string): { from: string; to: string } {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

/**
 * Meta's action list is long and overlapping. Only two things matter for the funnel:
 * how many people started a conversation, and how many submitted a lead form.
 */
const CONVERSATION_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];
const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export function actionValue(actions: { action_type: string; value: string | number }[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const hit = actions.find(a => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export const conversationsOf = (actions: MetaInsightRow["actions"]) => actionValue(actions, CONVERSATION_ACTIONS);
export const leadsOf = (actions: MetaInsightRow["actions"]) => actionValue(actions, LEAD_ACTIONS);

/** A raw insights row as the Graph API returns it. */
export interface MetaInsightRow {
  date_start?: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  clicks?: string | number;
  frequency?: string | number;
  region?: string;
  campaign_id?: string;
  campaign_name?: string;
  actions?: { action_type: string; value: string | number }[];
}

const int = (v: unknown) => Math.round(Number(v) || 0);

export function toMetaDay(accountId: string, row: MetaInsightRow): MetaDay | null {
  const date = row.date_start;
  if (!date) return null;
  return {
    accountId,
    date,
    spend: round2(Number(row.spend) || 0),
    impressions: int(row.impressions),
    reach: int(row.reach),
    clicks: int(row.clicks),
    conversations: conversationsOf(row.actions),
    leads: leadsOf(row.actions),
  };
}

export function toMetaPeriod(accountId: string, row: MetaInsightRow): MetaPeriod | null {
  const day = toMetaDay(accountId, row);
  return day ? { ...day, period: metaMonth(day.date) } : null;
}

/**
 * A regional row keeps six decimals: Meta splits the day's spend proportionally, so rounding each
 * region to cents first loses a cent off the day's total. Rounding happens once, after summing.
 */
export function toMetaRegionDay(accountId: string, row: MetaInsightRow): MetaRegionDay | null {
  const day = toMetaDay(accountId, row);
  if (!day || !row.region) return null;
  const { leads: _leads, ...rest } = day;
  return { ...rest, region: row.region, spend: Math.round((Number(row.spend) || 0) * 1e6) / 1e6 };
}

/**
 * Adds up daily rows for a window. `reach` stays null unless a matching period aggregate is supplied,
 * because reach counts people, and the same person reached on two days is one person, not two.
 */
export function metaFacts(days: MetaDay[], periods: MetaPeriod[] = []): MetaFacts | null {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const add = (pick: (d: MetaDay) => number) => sorted.reduce((a, d) => a + pick(d), 0);
  const spend = round2(add(d => d.spend));
  const impressions = add(d => d.impressions);
  const clicks = add(d => d.clicks);
  const conversations = add(d => d.conversations);
  const firstDate = sorted[0]!.date;
  const lastDate = sorted.at(-1)!.date;
  const accounts = [...new Set(sorted.map(d => d.accountId))].sort();

  // A true (deduplicated) reach is only available when the window is exactly the months Meta aggregated,
  // and every tracked account reported one of those months.
  const months = [...new Set(sorted.map(d => metaMonth(d.date)))].sort();
  const covered = months.every(m => {
    const { from, to } = metaMonthRange(m);
    const inMonth = sorted.filter(d => metaMonth(d.date) === m);
    return inMonth.some(d => d.date === from) && inMonth.some(d => d.date === to)
      && accounts.every(a => periods.some(p => p.period === m && p.accountId === a));
  });
  const matching = periods.filter(p => months.includes(p.period) && accounts.includes(p.accountId));
  // Reach can be summed across accounts and months only as an upper bound; a single month of a single
  // account is the one case where Meta's own number is exact.
  const reach = covered && matching.length === 1 ? matching[0]!.reach : null;

  return {
    spend,
    spendKzt: null,
    fxRate: null,
    impressions,
    reach,
    reachDays: add(d => d.reach),
    frequency: ratio(impressions, reach ?? 0),
    clicks,
    conversations,
    leads: add(d => d.leads),
    cpm: impressions > 0 ? round2((spend / impressions) * 1000) : null,
    cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions),
    costPerConversation: ratio(spend, conversations),
    days: sorted.length,
    firstDate,
    lastDate,
    accounts,
  };
}

/** Applies a ₸/USD rate to the facts. Without a rate the ₸ fields stay null. */
export function withFxRate(facts: MetaFacts | null, rate: number | null): MetaFacts | null {
  if (!facts) return null;
  if (!rate || rate <= 0) return { ...facts, spendKzt: null, fxRate: null };
  return { ...facts, spendKzt: Math.round(facts.spend * rate), fxRate: rate };
}

/** Sums the facts of several projects. Reach is never summed into a people count. */
export function consolidateMetaFacts(list: (MetaFacts | null)[]): MetaFacts | null {
  const facts = list.filter((f): f is MetaFacts => f !== null);
  if (!facts.length) return null;
  const add = (pick: (f: MetaFacts) => number) => facts.reduce((a, f) => a + pick(f), 0);
  const spend = round2(add(f => f.spend));
  const impressions = add(f => f.impressions);
  const clicks = add(f => f.clicks);
  const conversations = add(f => f.conversations);
  const kztKnown = facts.filter(f => f.spendKzt !== null);
  const rates = [...new Set(facts.map(f => f.fxRate).filter((r): r is number => r !== null))];
  return {
    spend,
    // Only a total that covers every project is a real total.
    spendKzt: kztKnown.length === facts.length ? kztKnown.reduce((a, f) => a + f.spendKzt!, 0) : null,
    fxRate: rates.length === 1 ? rates[0]! : null,
    impressions,
    reach: null,
    reachDays: add(f => f.reachDays),
    frequency: null,
    clicks,
    conversations,
    leads: add(f => f.leads),
    cpm: impressions > 0 ? round2((spend / impressions) * 1000) : null,
    cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions),
    costPerConversation: ratio(spend, conversations),
    days: Math.max(...facts.map(f => f.days)),
    firstDate: facts.map(f => f.firstDate).filter(Boolean).sort()[0] ?? null,
    lastDate: facts.map(f => f.lastDate).filter(Boolean).sort().at(-1) ?? null,
    accounts: [...new Set(facts.flatMap(f => f.accounts))].sort(),
  };
}

/**
 * Meta names Kazakhstan's regions in English. The three projects with their own point are matched by region;
 * everything else belongs to the online business, because that is where those sales are taken.
 */
export const META_REGIONS: Record<string, string> = {
  "Akmola Region": "Астана / Ақмола",
  "Almaty Region": "Алматы облысы",
  "Aktobe Region": "Ақтөбе",
  "Atyrau Region": "Атырау",
  "East Kazakhstan Region": "Шығыс Қазақстан",
  "Jambyl Region": "Жамбыл (Тараз)",
  "Karaganda Region": "Қарағанды",
  "Kostanay Region": "Қостанай",
  "Kyzylorda Region": "Қызылорда",
  "Mangystau Region": "Маңғыстау",
  "North Kazakhstan Region": "Солтүстік Қазақстан",
  "Pavlodar Region": "Павлодар",
  "South Kazakhstan Region": "Түркістан / Шымкент",
  "West Kazakhstan Region": "Батыс Қазақстан",
  Unknown: "Белгісіз",
};

export const regionLabel = (region: string) => META_REGIONS[region] ?? region;

/** Describes what the reach number in a window actually means, so nobody reads it as people. */
export function reachNote(facts: MetaFacts): string {
  return facts.reach !== null
    ? `${facts.reach.toLocaleString("ru-RU")} адам (Meta бір адамды бір рет санаған)`
    : `${facts.reachDays.toLocaleString("ru-RU")} көрсетілім-күн — бір адам бірнеше күн көрсе, қайта саналады. Нақты адам санын тек толық ай үшін Meta береді.`;
}
