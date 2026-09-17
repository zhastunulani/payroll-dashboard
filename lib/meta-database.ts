import { getRawDb, MAIN_WORKSPACE_ID } from "./database";
import { nbkRates, rateLookup } from "./fx.ts";
import {
  consolidateMetaFacts, metaFacts, metaMonth, metaMonthRange, metaRegionRules,
  toMetaDay, toMetaPeriod, toMetaRegionDay,
  type MetaAccount, type MetaDay, type MetaFacts, type MetaPeriod, type MetaProject, type MetaRegionDay,
  type MetaRegionRule, type MetaSplitMode, type MetaSyncRun,
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
  split_mode: MetaSplitMode; first_date: string | null; last_date: string | null; days: number | string | null;
};
const mapAccount = (r: AccountRow): MetaAccount => ({
  id: r.id, name: r.name, currency: r.currency, timezone: r.timezone, status: Number(r.status),
  projectId: r.project_id, tracked: Number(r.tracked) === 1,
  splitMode: r.split_mode ?? "none",
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
  /** Manual per-month overrides entered by the owner. */
  rates: { period: string; rate: number; source: string }[];
  /** The National Bank's official ₸/USD rate per day, for the loaded window. */
  dailyRates: { day: string; rate: number }[];
  regionRules: MetaRegionRule[];
  projects: MetaProject[];
  /** Per-project facts for every month of the window: the same attribution the reports use. */
  history: Record<string, Record<string, MetaFacts>>;
  /** The months covered, oldest first. */
  months: string[];
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
  /** Days for which the official ₸ rate was fetched this run. */
  rates: number;
  discovered: string[];
  skipped: { id: string; reason: string }[];
  message: string;
}

/**
 * Fetches the National Bank's rate for every spending day that has none yet. Rates never change once
 * published, so a day already stored is never asked for again.
 */
async function syncFxRates(days: string[], deadline: number, fetchImpl?: typeof fetch): Promise<number> {
  if (!days.length) return 0;
  const db = getRawDb();
  const unique = [...new Set(days)].sort();
  const known = new Set((await db.prepare("SELECT day FROM fx_daily WHERE currency='USD' AND day = ANY(?::text[])")
    .bind(unique).all<{ day: string }>()).results.map(r => r.day));
  const missing = unique.filter(day => !known.has(day));
  if (!missing.length) return 0;
  const fetched = await nbkRates(missing, "USD", { deadline, fetchImpl });
  await upsertChunks(
    "fx_daily",
    ["day", "currency", "rate", "source", "updated_at"],
    ["day", "currency"],
    fetched.map(r => [r.day, r.currency, r.rate, r.source, new Date().toISOString()]),
  );
  return fetched.length;
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
    const spendDays: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const account of wanted) {
      try {
        const daily = (await metaInsights({ accountId: account.id, from: options.from, to: options.to, increment: "1" }, fetchOptions))
          .map(row => toMetaDay(account.id, row))
          .filter((d): d is MetaDay => d !== null && (d.spend > 0 || d.impressions > 0));
        spendDays.push(...daily.filter(d => d.spend > 0).map(d => d.date));
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

    // 3. The ₸ rate for each spending day. A failure here loses no Meta data: ₸ simply stays empty.
    const rates = await syncFxRates(spendDays, Date.now() + 4 * 60_000, options.fetchImpl).catch(() => 0);

    const message = skipped.length ? `${skipped.length} аккаунт оқылмады: ${skipped.map(s => `${s.id} — ${s.reason}`).join("; ")}` : "";
    await finish("ok", wanted.length - skipped.length, totalDays, message);
    return { ok: true, accounts: wanted.length - skipped.length, days: totalDays, regionRows, rates, discovered, skipped, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish("error", 0, 0, message);
    throw new Error(message, { cause: error });
  }
}

/**
 * Monthly rate overrides — only what the owner entered by hand.
 *
 * A rate found in an old ledger row is deliberately *not* used: those were single snapshots (one
 * report was priced at the National Bank's rate for the 13th and applied to the whole month), and
 * letting one stand in for a month would override the day-by-day official rates with something less
 * accurate. Only a deliberate entry wins over them.
 */
export async function metaRates(): Promise<{ period: string; rate: number; source: string }[]> {
  const manual = await getRawDb().prepare("SELECT period, rate, source FROM meta_fx_rates ORDER BY period")
    .all<{ period: string; rate: string | number; source: string }>();
  return manual.results.map(r => ({ period: r.period, rate: Number(r.rate), source: r.source || "Қолмен енгізілген" }));
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

/**
 * Fetches the official rate for every spending day that still lacks one. Runs on its own, without the
 * Meta token, so ₸ figures can be filled in even when the ad cabinet cannot be reached.
 */
export async function backfillFxRates(fetchImpl?: typeof fetch): Promise<{ fetched: number; missing: string[] }> {
  await ensureMetaDatabase();
  const db = getRawDb();
  const days = await db.prepare(`SELECT DISTINCT d.day FROM meta_daily d
    LEFT JOIN fx_daily f ON f.day = d.day AND f.currency = 'USD'
    WHERE d.spend > 0 AND f.day IS NULL ORDER BY d.day`).all<{ day: string }>();
  const wanted = days.results.map(r => r.day);
  if (!wanted.length) return { fetched: 0, missing: [] };
  const fetched = await syncFxRates(wanted, Date.now() + 5 * 60_000, fetchImpl);
  const still = await db.prepare(`SELECT DISTINCT d.day FROM meta_daily d
    LEFT JOIN fx_daily f ON f.day = d.day AND f.currency = 'USD'
    WHERE d.spend > 0 AND f.day IS NULL ORDER BY d.day`).all<{ day: string }>();
  return { fetched, missing: still.results.map(r => r.day) };
}

/** The official ₸/USD rate per day for a window. */
export async function fxDaily(from: string, to: string): Promise<{ day: string; rate: number }[]> {
  const rows = await getRawDb().prepare("SELECT day, rate FROM fx_daily WHERE currency='USD' AND day BETWEEN ? AND ? ORDER BY day")
    .bind(from, to).all<{ day: string; rate: string | number }>();
  return rows.results.map(r => ({ day: r.day, rate: Number(r.rate) }));
}

export async function projectList(): Promise<MetaProject[]> {
  const rows = await getRawDb().prepare("SELECT id, name FROM workspaces ORDER BY sort_order, created_at").all<MetaProject>();
  return rows.results;
}

/** The region table: the owner's overrides on top of the defaults. */
export async function regionRules(projects?: MetaProject[]): Promise<MetaRegionRule[]> {
  const db = getRawDb();
  const [overrides, seen, list] = await Promise.all([
    db.prepare("SELECT region, project_id FROM meta_region_rules").all<{ region: string; project_id: string | null }>(),
    db.prepare("SELECT DISTINCT region FROM meta_region_daily").all<{ region: string }>(),
    projects ? Promise.resolve(projects) : projectList(),
  ]);
  return metaRegionRules(
    seen.results.map(r => r.region),
    list,
    MAIN_WORKSPACE_ID,
    overrides.results.map(r => ({ region: r.region, projectId: r.project_id })),
  );
}

/** Moves one region to a project, or back to the default when `reset` is asked for. */
export async function saveRegionRule(region: string, projectId: string | null, reset: boolean) {
  await ensureMetaDatabase();
  const db = getRawDb();
  if (reset) {
    await db.prepare("DELETE FROM meta_region_rules WHERE region=?").bind(region).run();
    return;
  }
  await db.prepare(`INSERT INTO meta_region_rules(region, project_id, updated_at) VALUES(?,?,?)
    ON CONFLICT (region) DO UPDATE SET project_id=EXCLUDED.project_id, updated_at=EXCLUDED.updated_at`)
    .bind(region, projectId, new Date().toISOString()).run();
}

/**
 * Points an ad account at a project, or has it divided by region. Untracked accounts are ignored by
 * the reports; "none" means the owner has not decided yet and the money reaches no P&L.
 */
export async function saveMetaAccount(id: string, projectId: string | null, tracked: boolean, note: string, splitMode: MetaSplitMode = "none") {
  await ensureMetaDatabase();
  const mode: MetaSplitMode = splitMode === "region" ? "region" : projectId ? "project" : "none";
  const result = await getRawDb().prepare(`UPDATE meta_accounts SET project_id=?, tracked=?, note=?, split_mode=?, updated_at=? WHERE id=?`)
    .bind(mode === "region" ? null : projectId, tracked ? 1 : 0, note, mode, new Date().toISOString(), id).run();
  // Saying nothing when the account is unknown would look like success and quietly change nothing.
  if (!result.meta.changes) throw new Error(`«${id}» кабинеті тізімде жоқ. Алдымен «Жаңарту» арқылы кабинеттерді тартыңыз.`);
}

/** Everything the target screen needs for a window of months. */
export async function loadMeta(from: string, to: string): Promise<MetaData> {
  await ensureMetaDatabase();
  const db = getRawDb();
  const token = metaToken();
  const [accounts, days, periods, regions, rates, dailyRates, projects, lastRun] = await Promise.all([
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
    fxDaily(from, to),
    projectList(),
    db.prepare("SELECT * FROM meta_sync_runs ORDER BY started_at DESC LIMIT 1")
      .all<{ id: string; started_at: string; finished_at: string | null; status: MetaSyncRun["status"]; accounts: number; days: number; range_from: string; range_to: string; message: string }>(),
  ]);

  const run = lastRun.results[0];
  // Every month the window touches, oldest first.
  const months: string[] = [];
  for (let m = metaMonth(from); m <= metaMonth(to); ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = `${mo === 12 ? y! + 1 : y}-${String(mo === 12 ? 1 : mo! + 1).padStart(2, "0")}`;
  }
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
    dailyRates,
    regionRules: await regionRules(projects),
    projects,
    history: await metaFactsByPeriod(from, to, months).catch(() => ({})),
    months,
    lastSync: run
      ? { id: run.id, startedAt: run.started_at, finishedAt: run.finished_at, status: run.status, accounts: Number(run.accounts), days: Number(run.days), from: run.range_from, to: run.range_to, message: run.message }
      : null,
    from,
    to,
  };
}

/**
 * Meta facts per project for a window, for the finance layer.
 *
 * An account either belongs to one project or is divided by the region Meta delivered it to. An
 * account the owner has not decided on contributes nothing, so no spend is ever attributed to a
 * project by guesswork. Every day converts at its own official ₸ rate.
 */
interface MetaRaw {
  accounts: { id: string; project_id: string | null; split_mode: MetaSplitMode }[];
  days: MetaDay[];
  periods: MetaPeriod[];
  regions: MetaRegionDay[];
  rateOf: (day: string) => number | null;
  rules: MetaRegionRule[];
}

/** Reads everything the attribution needs, once, so a window can then be sliced in memory. */
async function metaRaw(from: string, to: string): Promise<MetaRaw> {
  await ensureMetaDatabase();
  const db = getRawDb();
  const [accounts, days, periods, regionRows, monthly, daily, rules] = await Promise.all([
    db.prepare("SELECT id, project_id, split_mode FROM meta_accounts WHERE tracked=1").all<{ id: string; project_id: string | null; split_mode: MetaSplitMode }>(),
    db.prepare("SELECT * FROM meta_daily WHERE day BETWEEN ? AND ?").bind(from, to).all<DayRow>(),
    db.prepare("SELECT * FROM meta_period WHERE period BETWEEN ? AND ?").bind(from.slice(0, 7), to.slice(0, 7))
      .all<{ account_id: string; period: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number; leads: number }>(),
    db.prepare("SELECT account_id, day, region, spend, impressions, reach, clicks, conversations FROM meta_region_daily WHERE day BETWEEN ? AND ?").bind(from, to)
      .all<{ account_id: string; day: string; region: string; spend: string | number; impressions: number; reach: number; clicks: number; conversations: number }>(),
    metaRates(),
    fxDaily(from, to),
    regionRules(),
  ]);
  return {
    accounts: accounts.results,
    days: days.results.map(mapDay),
    periods: periods.results.map(r => ({
      accountId: r.account_id, period: r.period, spend: Number(r.spend), impressions: Number(r.impressions),
      reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations), leads: Number(r.leads),
    })),
    regions: regionRows.results.map(r => ({
      accountId: r.account_id, date: r.day, region: r.region, spend: Number(r.spend),
      impressions: Number(r.impressions), reach: Number(r.reach), clicks: Number(r.clicks), conversations: Number(r.conversations),
    })),
    rateOf: rateLookup(daily, monthly),
    rules,
  };
}

/** Attributes one slice of the raw data to projects. */
function metaFactsFrom(raw: MetaRaw, from: string, to: string): Record<string, MetaFacts> {
  const { rateOf, rules } = raw;
  const inWindow = <T extends { date: string }>(rows: T[]) => rows.filter(r => r.date >= from && r.date <= to);
  const days = { results: inWindow(raw.days) };
  const regionRows = { results: inWindow(raw.regions) };
  const accounts = { results: raw.accounts };
  // A period's deduplicated reach only applies when the slice is that whole period.
  const periodRows = raw.periods.filter(p => {
    const range = metaMonthRange(p.period);
    return range.from >= from && range.to <= to;
  });

  const whole = new Map(accounts.results.filter(a => a.split_mode === "project" && a.project_id).map(a => [a.id, a.project_id!]));
  const split = new Set(accounts.results.filter(a => a.split_mode === "region").map(a => a.id));
  const parts = new Map<string, MetaFacts[]>();
  const add = (projectId: string, facts: MetaFacts | null) => {
    if (!facts) return;
    parts.set(projectId, [...(parts.get(projectId) ?? []), facts]);
  };

  // Accounts that belong to one project: the whole account, with its real reach.
  const byProject = new Map<string, MetaDay[]>();
  for (const row of days.results) {
    const id = whole.get(row.accountId);
    if (!id) continue;
    byProject.set(id, [...(byProject.get(id) ?? []), row]);
  }
  for (const [projectId, rows] of byProject) add(projectId, metaFacts(rows, periodRows, rateOf));

  // Accounts divided by region: money follows the region, and the other metrics follow with it.
  const regionsByAccount = new Map<string, MetaRegionDay[]>();
  for (const row of regionRows.results) {
    if (!split.has(row.accountId)) continue;
    regionsByAccount.set(row.accountId, [...(regionsByAccount.get(row.accountId) ?? []), row]);
  }
  const ruleFor = new Map(rules.map(r => [r.region, r.projectId]));
  for (const [accountId, rows] of regionsByAccount) {
    // Each region belongs to one project, so the rows group cleanly: project → day → totals.
    const perProject = new Map<string, Map<string, MetaDay>>();
    for (const row of rows) {
      const projectId = ruleFor.get(row.region) ?? null;
      if (!projectId) continue;
      const byDay = perProject.get(projectId) ?? new Map<string, MetaDay>();
      const day = byDay.get(row.date) ?? { accountId, date: row.date, spend: 0, impressions: 0, reach: 0, clicks: 0, conversations: 0, leads: 0 };
      day.spend += row.spend;
      day.impressions += row.impressions;
      day.reach += row.reach;
      day.clicks += row.clicks;
      day.conversations += row.conversations;
      byDay.set(row.date, day);
      perProject.set(projectId, byDay);
    }
    for (const [projectId, byDay] of perProject) {
      const rowsForProject = [...byDay.values()].map(d => ({ ...d, spend: Math.round(d.spend * 100) / 100 }));
      // A regional share has no deduplicated reach of its own, so no period rows are passed:
      // `reach` stays null and only «көрсетілім-күн» is reported for it.
      add(projectId, metaFacts(rowsForProject, [], rateOf));
    }
  }

  const out: Record<string, MetaFacts> = {};
  for (const [projectId, list] of parts) {
    const facts = list.length === 1 ? list[0]! : consolidateMetaFacts(list);
    if (facts) out[projectId] = facts;
  }
  return out;
}

/** Per-project Meta facts for a whole window. */
export async function metaFactsWindow(from: string, to: string): Promise<Record<string, MetaFacts>> {
  return metaFactsFrom(await metaRaw(from, to), from, to);
}

/**
 * Per-project Meta facts month by month, shaped like `bankFactsWindow` so the finance layer can use
 * both the same way. Reads the database once and slices the months in memory.
 */
export async function metaFactsByPeriod(from: string, to: string, months: string[]): Promise<Record<string, Record<string, MetaFacts>>> {
  const raw = await metaRaw(from, to);
  const out: Record<string, Record<string, MetaFacts>> = {};
  for (const period of months) {
    const range = metaMonthRange(period);
    for (const [projectId, facts] of Object.entries(metaFactsFrom(raw, range.from, range.to))) {
      (out[projectId] ??= {})[period] = facts;
    }
  }
  return out;
}
