import { getRawDb } from "./database";
import {
  metaFacts, metaMonth, toMetaDay, toMetaPeriod, toMetaRegionDay, withFxRate,
  type MetaAccount, type MetaDay, type MetaFacts, type MetaPeriod, type MetaRegionDay, type MetaSyncRun,
} from "./meta.ts";
import { metaAdAccounts, metaInsights, metaTokenInfo, type MetaFetchOptions, type MetaTokenInfo } from "./meta-api.ts";
import { META_SCHEMA } from "./meta-schema.ts";

let ready: Promise<void> | null = null;
export function ensureMetaDatabase() {
  ready ??= getRawDb().batch(META_SCHEMA.map(sql => getRawDb().prepare(sql))).then(() => undefined).catch(e => { ready = null; throw e; });
  return ready;
}

/** The token lives only in the environment; it is never stored in the database or sent to the browser. */
export const metaToken = () => process.env.META_ACCESS_TOKEN?.trim() ?? "";

/**
 * Checking a token costs a round trip to Meta, so the answer is cached: opening a page must not wait
 * on Facebook. Five minutes is short enough to notice a revoked token and long enough to stay off the
 * critical path.
 */
const TOKEN_TTL = 5 * 60_000;
let tokenCache: { token: string; at: number; info: MetaTokenInfo } | null = null;
async function cachedTokenInfo(token: string): Promise<MetaTokenInfo> {
  if (tokenCache && tokenCache.token === token && Date.now() - tokenCache.at < TOKEN_TTL) return tokenCache.info;
  const blank: MetaTokenInfo = { valid: false, type: "", appId: "", appName: "", expiresAt: null, dataAccessExpiresAt: null, scopes: [], userId: "" };
  const info = await metaTokenInfo({ token, deadline: Date.now() + 8_000 }).catch(() => blank);
  // A failed check is not cached: the next page load tries again.
  if (info.valid) tokenCache = { token, at: Date.now(), info };
  return info;
}

type AccountRow = {
  id: string; name: string; currency: string; timezone: string; status: number;
  project_id: string | null; tracked: number; spend_lifetime: string | number | null; note: string;
  first_date: string | null; last_date: string | null; days: number | string | null;
};
const mapAccount = (r: AccountRow): MetaAccount => ({
  id: r.id, name: r.name, currency: r.currency, timezone: r.timezone, status: Number(r.status),
  projectId: r.project_id, tracked: Number(r.tracked) === 1,
  spendLifetime: r.spend_lifetime === null ? null : Number(r.spend_lifetime),
  firstDate: r.first_date, lastDate: r.last_date, days: Number(r.days ?? 0),
});

type DayRow = { account_id: string; day: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number; leads: number };
const mapDay = (r: DayRow): MetaDay => ({
  accountId: r.account_id, date: r.day, spend: Number(r.spend), impressions: Number(r.impressions),
  reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations), leads: Number(r.leads),
});

export interface MetaData {
  connected: boolean;
  token: (MetaTokenInfo & { present: true }) | { present: false; message: string };
  accounts: MetaAccount[];
  days: MetaDay[];
  periods: MetaPeriod[];
  regions: MetaRegionDay[];
  rates: { period: string; rate: number; source: string }[];
  lastSync: MetaSyncRun | null;
  from: string;
  to: string;
}

/** Writes rows in chunks; a re-sync of the same day overwrites it instead of adding a second row. */
async function upsertChunks(table: string, columns: string[], conflict: string[], rows: (string | number | null)[][]) {
  if (!rows.length) return;
  const db = getRawDb();
  const updates = columns.filter(c => !conflict.includes(c)).map(c => `${c}=EXCLUDED.${c}`).join(", ");
  const statements = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    statements.push(db.prepare(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES ${placeholders}
       ON CONFLICT (${conflict.join(",")}) DO UPDATE SET ${updates}`,
    ).bind(...chunk.flat()));
  }
  await db.batch(statements);
}

export interface MetaSyncOptions {
  from: string;
  to: string;
  /** Pull the geographic split too. It is a much heavier query, so it is opt-in. */
  regions?: boolean;
  accountIds?: string[];
  fetchImpl?: typeof fetch;
}

export interface MetaSyncResult {
  ok: boolean;
  accounts: number;
  days: number;
  regionRows: number;
  discovered: string[];
  skipped: { id: string; reason: string }[];
  message: string;
}

/**
 * Pulls Meta insights into the database. Runs account by account so one failing account does not lose
 * the others, and records what happened in meta_sync_runs.
 */
export async function syncMeta(options: MetaSyncOptions): Promise<MetaSyncResult> {
  await ensureMetaDatabase();
  const token = metaToken();
  if (!token) throw new Error("META_ACCESS_TOKEN орнатылмаған. Токенді .env файлына қосыңыз.");
  const db = getRawDb();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const fetchOptions: MetaFetchOptions = { token, deadline: Date.now() + 8 * 60_000, fetchImpl: options.fetchImpl };
  await db.prepare("INSERT INTO meta_sync_runs(id, started_at, status, range_from, range_to) VALUES(?,?,?,?,?)")
    .bind(runId, now, "running", options.from, options.to).run();

  const finish = async (status: "ok" | "error", accounts: number, days: number, message: string) => {
    await db.prepare("UPDATE meta_sync_runs SET finished_at=?, status=?, accounts=?, days=?, message=? WHERE id=?")
      .bind(new Date().toISOString(), status, accounts, days, message, runId).run();
  };

  try {
    // 1. Refresh the account list. A new account arrives untracked with no project, so nothing is
    //    silently attributed to a project the owner did not choose.
    const raw = await metaAdAccounts(fetchOptions);
    const known = new Set((await db.prepare("SELECT id FROM meta_accounts").all<{ id: string }>()).results.map(r => r.id));
    const discovered = raw.filter(a => !known.has(a.id)).map(a => a.id);
    await upsertChunks(
      "meta_accounts",
      ["id", "name", "currency", "timezone", "status", "spend_lifetime", "updated_at"],
      ["id"],
      raw.map(a => [a.id, a.name ?? "", a.currency ?? "USD", a.timezone_name ?? "", Number(a.account_status) || 0, a.amount_spent === undefined ? null : Number(a.amount_spent) / 100, now]),
    );

    // 2. Which accounts to pull. By default every account Meta shows, so an account that starts
    //    spending is noticed; the owner decides later which project it belongs to.
    const wanted = options.accountIds?.length
      ? raw.filter(a => options.accountIds!.includes(a.id))
      : raw;

    let totalDays = 0;
    let regionRows = 0;
    const skipped: { id: string; reason: string }[] = [];
    for (const account of wanted) {
      try {
        const daily = (await metaInsights({ accountId: account.id, from: options.from, to: options.to, increment: "1" }, fetchOptions))
          .map(row => toMetaDay(account.id, row))
          .filter((d): d is MetaDay => d !== null && (d.spend > 0 || d.impressions > 0));
        if (daily.length) {
          await upsertChunks(
            "meta_daily",
            ["account_id", "day", "spend", "impressions", "reach", "clicks", "conversations", "leads", "updated_at"],
            ["account_id", "day"],
            daily.map(d => [d.accountId, d.date, d.spend, d.impressions, d.reach, d.clicks, d.conversations, d.leads, now]),
          );
          totalDays += daily.length;
        }

        // Monthly rows carry the deduplicated reach, which cannot be derived from the daily rows.
        const monthly = (await metaInsights({ accountId: account.id, from: options.from, to: options.to, increment: "monthly" }, fetchOptions))
          .map(row => toMetaPeriod(account.id, row))
          .filter((p): p is MetaPeriod => p !== null && (p.spend > 0 || p.impressions > 0));
        if (monthly.length) {
          await upsertChunks(
            "meta_period",
            ["account_id", "period", "spend", "impressions", "reach", "clicks", "conversations", "leads", "updated_at"],
            ["account_id", "period"],
            monthly.map(p => [p.accountId, p.period, p.spend, p.impressions, p.reach, p.clicks, p.conversations, p.leads, now]),
          );
        }

        if (options.regions && daily.length) {
          const regions = (await metaInsights({ accountId: account.id, from: options.from, to: options.to, increment: "1", breakdowns: ["region"] }, fetchOptions))
            .map(row => toMetaRegionDay(account.id, row))
            .filter((r): r is MetaRegionDay => r !== null && (r.spend > 0 || r.impressions > 0));
          if (regions.length) {
            await upsertChunks(
              "meta_region_daily",
              ["account_id", "day", "region", "spend", "impressions", "reach", "clicks", "conversations", "updated_at"],
              ["account_id", "day", "region"],
              regions.map(r => [r.accountId, r.date, r.region, r.spend, r.impressions, r.reach, r.clicks, r.conversations, now]),
            );
            regionRows += regions.length;
          }
        }
      } catch (error) {
        skipped.push({ id: account.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    const message = skipped.length ? `${skipped.length} аккаунт оқылмады: ${skipped.map(s => `${s.id} — ${s.reason}`).join("; ")}` : "";
    await finish("ok", wanted.length - skipped.length, totalDays, message);
    return { ok: true, accounts: wanted.length - skipped.length, days: totalDays, regionRows, discovered, skipped, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish("error", 0, 0, message);
    throw new Error(message, { cause: error });
  }
}

/**
 * The rate for a month: the owner's entry wins; otherwise the ledger's own USD target entry for that
 * month supplies it, because that is the number already used in the reports.
 */
export async function metaRates(): Promise<{ period: string; rate: number; source: string }[]> {
  const db = getRawDb();
  const [manual, ledger] = await Promise.all([
    db.prepare("SELECT period, rate, source FROM meta_fx_rates").all<{ period: string; rate: string | number; source: string }>(),
    db.prepare(`SELECT period, round(avg(fx_rate)::numeric, 4) AS rate FROM finance_entries
      WHERE currency = 'USD' AND fx_rate > 0 AND category = 'marketing' GROUP BY period`)
      .all<{ period: string; rate: string | number }>()
      .catch(() => ({ results: [] as { period: string; rate: string | number }[] })),
  ]);
  const out = new Map<string, { period: string; rate: number; source: string }>();
  for (const r of ledger.results) out.set(r.period, { period: r.period, rate: Number(r.rate), source: "Реестрдегі таргет жазбасының бағамы" });
  for (const r of manual.results) out.set(r.period, { period: r.period, rate: Number(r.rate), source: r.source || "Қолмен енгізілген" });
  return [...out.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export async function saveMetaRate(period: string, rate: number | null, source: string) {
  await ensureMetaDatabase();
  const db = getRawDb();
  if (rate === null || !(rate > 0)) {
    await db.prepare("DELETE FROM meta_fx_rates WHERE period=?").bind(period).run();
    return;
  }
  await db.prepare(`INSERT INTO meta_fx_rates(period, rate, source, updated_at) VALUES(?,?,?,?)
    ON CONFLICT (period) DO UPDATE SET rate=EXCLUDED.rate, source=EXCLUDED.source, updated_at=EXCLUDED.updated_at`)
    .bind(period, rate, source, new Date().toISOString()).run();
}

/** Points an ad account at a project, or clears it. Untracked accounts are ignored by the reports. */
export async function saveMetaAccount(id: string, projectId: string | null, tracked: boolean, note: string) {
  await ensureMetaDatabase();
  await getRawDb().prepare(`UPDATE meta_accounts SET project_id=?, tracked=?, note=?, updated_at=? WHERE id=?`)
    .bind(projectId, tracked ? 1 : 0, note, new Date().toISOString(), id).run();
}

/** Everything the target screen needs for a window of months. */
export async function loadMeta(from: string, to: string): Promise<MetaData> {
  await ensureMetaDatabase();
  const db = getRawDb();
  const token = metaToken();
  const [accounts, days, periods, regions, rates, lastRun] = await Promise.all([
    db.prepare(`SELECT a.*, d.first_date, d.last_date, d.days FROM meta_accounts a
      LEFT JOIN (SELECT account_id, min(day) AS first_date, max(day) AS last_date, count(*) AS days FROM meta_daily GROUP BY account_id) d
        ON d.account_id = a.id
      ORDER BY a.name`).all<AccountRow>(),
    db.prepare("SELECT * FROM meta_daily WHERE day BETWEEN ? AND ? ORDER BY day").bind(from, to).all<DayRow>(),
    db.prepare("SELECT * FROM meta_period WHERE period BETWEEN ? AND ?").bind(from.slice(0, 7), to.slice(0, 7))
      .all<{ account_id: string; period: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number; leads: number }>(),
    db.prepare("SELECT * FROM meta_region_daily WHERE day BETWEEN ? AND ?").bind(from, to)
      .all<{ account_id: string; day: string; region: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number }>(),
    metaRates(),
    db.prepare("SELECT * FROM meta_sync_runs ORDER BY started_at DESC LIMIT 1")
      .all<{ id: string; started_at: string; finished_at: string | null; status: MetaSyncRun["status"]; accounts: number; days: number; range_from: string; range_to: string; message: string }>(),
  ]);

  const run = lastRun.results[0];
  return {
    connected: Boolean(token),
    token: token
      ? { present: true, ...await cachedTokenInfo(token) }
      : { present: false, message: "META_ACCESS_TOKEN орнатылмаған." },
    accounts: accounts.results.map(mapAccount),
    days: days.results.map(mapDay),
    periods: periods.results.map(r => ({
      accountId: r.account_id, period: r.period, spend: Number(r.spend), impressions: Number(r.impressions),
      reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations), leads: Number(r.leads),
    })),
    regions: regions.results.map(r => ({
      accountId: r.account_id, date: r.day, region: r.region, spend: Number(r.spend), impressions: Number(r.impressions),
      reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations),
    })),
    rates,
    lastSync: run
      ? { id: run.id, startedAt: run.started_at, finishedAt: run.finished_at, status: run.status, accounts: Number(run.accounts), days: Number(run.days), from: run.range_from, to: run.range_to, message: run.message }
      : null,
    from,
    to,
  };
}

/**
 * Meta facts per project for a window, for the finance layer. Only tracked accounts that point at a
 * project are counted, so unmapped spending is never quietly added to someone's P&L.
 */
export async function metaFactsWindow(from: string, to: string): Promise<Record<string, MetaFacts>> {
  await ensureMetaDatabase();
  const db = getRawDb();
  const [accounts, days, periods, rates] = await Promise.all([
    db.prepare("SELECT id, project_id FROM meta_accounts WHERE tracked=1 AND project_id IS NOT NULL").all<{ id: string; project_id: string }>(),
    db.prepare("SELECT * FROM meta_daily WHERE day BETWEEN ? AND ?").bind(from, to).all<DayRow>(),
    db.prepare("SELECT * FROM meta_period WHERE period BETWEEN ? AND ?").bind(from.slice(0, 7), to.slice(0, 7))
      .all<{ account_id: string; period: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number; leads: number }>(),
    metaRates(),
  ]);
  const project = new Map(accounts.results.map(a => [a.id, a.project_id]));
  if (!project.size) return {};

  const byProject = new Map<string, MetaDay[]>();
  for (const row of days.results) {
    const id = project.get(row.account_id);
    if (!id) continue;
    const list = byProject.get(id) ?? [];
    list.push(mapDay(row));
    byProject.set(id, list);
  }
  const periodRows: MetaPeriod[] = periods.results.map(r => ({
    accountId: r.account_id, period: r.period, spend: Number(r.spend), impressions: Number(r.impressions),
    reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations), leads: Number(r.leads),
  }));

  // One window can span months with different rates, so the ₸ figure is built month by month.
  const rateOf = (period: string) => rates.find(r => r.period === period)?.rate ?? null;
  const out: Record<string, MetaFacts> = {};
  for (const [projectId, rows] of byProject) {
    const facts = metaFacts(rows, periodRows);
    if (!facts) continue;
    const months = [...new Set(rows.map(r => metaMonth(r.date)))];
    const known = months.filter(m => rateOf(m) !== null);
    const spendKzt = known.length === months.length
      ? Math.round(months.reduce((a, m) => a + rows.filter(r => metaMonth(r.date) === m).reduce((s, r) => s + r.spend, 0) * rateOf(m)!, 0))
      : null;
    const single = months.length === 1 ? rateOf(months[0]!) : null;
    out[projectId] = spendKzt === null ? withFxRate(facts, null)! : { ...facts, spendKzt, fxRate: single };
  }
  return out;
}
