import { consolidateMetaFacts, metaFacts, metaMonth, metaMonthRange, withFxRate, type MetaDay, type MetaFacts } from "../../lib/meta";
import type { MetaData, MetaSyncResult } from "../../lib/meta-database";
import { messageOf } from "./useBank";

/** Meta advertising: daily spend, reach and conversations per ad account, mapped to projects. */
export function useMeta() {
  const data = useState<MetaData | null>("meta:data", () => null);
  const loading = useState("meta:loading", () => false);
  const syncing = useState("meta:syncing", () => false);
  const error = useState("meta:error", () => "");
  const period = usePeriod();
  // A year, so «ай сайын қанша кеткені» is visible without changing the reports' own 6-month window.
  const months = useState("meta:months", () => 12);
  let sequence = 0;

  async function load() {
    const current = ++sequence;
    loading.value = true;
    try {
      const next = await $fetch<MetaData>("/api/meta", { query: { period: period.value, months: months.value } });
      if (current === sequence) { data.value = next; error.value = ""; }
    } catch (e) {
      if (current === sequence) error.value = messageOf(e, "Meta деректері жүктелмеді.");
    } finally {
      if (current === sequence) loading.value = false;
    }
  }

  const post = <T>(body: Record<string, unknown>) => $fetch<T>("/api/meta", { method: "POST", body });
  async function act(body: Record<string, unknown>) {
    const result = await post<{ ok: true }>(body);
    await load();
    return result;
  }

  /**
   * Days of one project, or — with no project — of every tracked account, mapped or not.
   * The panel must show what Meta actually charged even before the owner has said which project
   * an account belongs to; only the project P&L waits for that decision.
   */
  function daysOf(projectId?: string | null): MetaDay[] {
    const d = data.value;
    if (!d) return [];
    const wanted = d.accounts.filter(a => a.tracked && (projectId ? a.projectId === projectId : true));
    const ids = new Set(wanted.map(a => a.id));
    return d.days.filter(row => ids.has(row.accountId));
  }

  /** Facts for one project-month, with the month's ₸ rate applied. */
  function factsOf(projectId: string | null, forPeriod = period.value): MetaFacts | null {
    const d = data.value;
    if (!d) return null;
    const { from, to } = metaMonthRange(forPeriod);
    const rows = daysOf(projectId).filter(r => r.date >= from && r.date <= to);
    const rate = d.rates.find(r => r.period === forPeriod)?.rate ?? null;
    return withFxRate(metaFacts(rows, d.periods), rate);
  }

  /**
   * Every tracked account together — mapped or not. Built from the days directly rather than by
   * consolidating projects, so the panel still shows the real spend before anything is mapped.
   */
  const totalFacts = (forPeriod = period.value) => factsOf(null, forPeriod);

  /** Only what is attributed to projects: what the P&L is allowed to use. */
  const mappedFacts = (forPeriod = period.value) => {
    const d = data.value;
    if (!d) return null;
    const projects = [...new Set(d.accounts.filter(a => a.tracked && a.projectId).map(a => a.projectId!))];
    return consolidateMetaFacts(projects.map(id => factsOf(id, forPeriod)));
  };

  /** Spend per day for a chart, oldest first. */
  function series(projectId: string | null) {
    const rows = daysOf(projectId);
    const byDay = new Map<string, number>();
    for (const row of rows) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.spend);
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, spend]) => ({ date, spend }));
  }

  /** Spend per month, for the six-month target chart. */
  function monthly(projectId: string | null) {
    const byMonth = new Map<string, number>();
    for (const row of daysOf(projectId)) byMonth.set(metaMonth(row.date), (byMonth.get(metaMonth(row.date)) ?? 0) + row.spend);
    return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([p, spend]) => ({ period: p, spend: Math.round(spend * 100) / 100 }));
  }

  /** Geographic split, largest first. Defaults to the selected month, not the whole loaded window. */
  function regions(forPeriod: string | null = period.value) {
    const d = data.value;
    if (!d) return [];
    const window = forPeriod ? metaMonthRange(forPeriod) : null;
    // Same account set as the totals above, so the split can never disagree with the spend it splits.
    const ids = new Set(d.accounts.filter(a => a.tracked).map(a => a.id));
    const rows = d.regions.filter(r => ids.has(r.accountId) && (!window || (r.date >= window.from && r.date <= window.to)));
    const byRegion = new Map<string, { region: string; spend: number; clicks: number; reachDays: number }>();
    for (const row of rows) {
      const hit = byRegion.get(row.region) ?? { region: row.region, spend: 0, clicks: 0, reachDays: 0 };
      hit.spend += row.spend;
      hit.clicks += row.clicks;
      hit.reachDays += row.reach;
      byRegion.set(row.region, hit);
    }
    return [...byRegion.values()].sort((a, b) => b.spend - a.spend).map(r => ({ ...r, spend: Math.round(r.spend * 100) / 100 }));
  }

  const unmapped = computed(() => (data.value?.accounts ?? []).filter(a => a.days > 0 && (!a.projectId || !a.tracked)));

  return {
    data, loading, syncing, error, period, months, load,
    daysOf, factsOf, totalFacts, mappedFacts, series, monthly, regions, unmapped,
    async sync(from: string, to: string, withRegions = true) {
      syncing.value = true;
      try {
        const result = await post<MetaSyncResult>({ action: "sync", from, to, regions: withRegions });
        await load();
        return result;
      } finally {
        syncing.value = false;
      }
    },
    saveAccount: (id: string, projectId: string | null, tracked: boolean, note = "", splitMode: "none" | "project" | "region" = "none") =>
      act({ action: "account", id, projectId, tracked, note, splitMode }),
    saveRegion: (region: string, projectId: string | null, reset = false) => act({ action: "region", region, projectId, reset }),
    saveRate: (forPeriod: string, rate: number | null, source = "Қолмен енгізілген") => act({ action: "rate", period: forPeriod, rate, source }),
    /** Saves the pasted token(s) for every environment at once; an empty value clears them. */
    async saveToken(token: string) {
      const result = await post<{ ok: true; stored: number }>({ action: "token", token });
      await load();
      return result;
    },
    /** Fills in the official ₸ rates for days that lack one; needs no Meta token. */
    async backfillRates() {
      const result = await post<{ ok: true; fetched: number; missing: string[] }>({ action: "rates" });
      await load();
      return result;
    },
  };
}
