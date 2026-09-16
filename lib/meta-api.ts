import { META_API_VERSION, type MetaInsightRow } from "./meta.ts";

/**
 * Thin Graph API client. Everything the dashboard reads is an insights query, so the whole client is
 * one paging fetch plus a back-off for Meta's throttling, which is routine rather than exceptional.
 */

const BASE = `https://graph.facebook.com/${META_API_VERSION}`;
/** Error codes Meta uses for «too many calls, come back later». */
const THROTTLED = new Set([1, 2, 4, 17, 341, 613]);

export class MetaApiError extends Error {
  constructor(message: string, readonly code: number, readonly subcode: number | null) {
    super(message);
    this.name = "MetaApiError";
  }
}

export interface MetaFetchOptions {
  token: string;
  /** Wall-clock budget: a sync must not hold a request open for ever. */
  deadline?: number;
  fetchImpl?: typeof fetch;
  onWait?: (ms: number, attempt: number) => void;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Turns a Graph error into a message the owner can act on. */
function describe(error: { code?: number; error_subcode?: number; message?: string; type?: string }): MetaApiError {
  const code = Number(error.code) || 0;
  const subcode = error.error_subcode === undefined ? null : Number(error.error_subcode);
  const raw = error.message ?? "Meta API қатесі";
  const hint = code === 190
    ? " Токеннің мерзімі бітті немесе қайтарылып алынды — жаңа токен керек."
    : code === 200 || code === 272 || code === 273
      ? " Токенге ads_read рұқсаты немесе осы жарнама аккаунтына кіру берілмеген."
      : code === 100 && /business_management/i.test(raw)
        ? " Бұл өріс business_management рұқсатын сұрайды; онсыз да негізгі есеп жұмыс істейді."
        : "";
  return new MetaApiError(`${raw}${hint}`, code, subcode);
}

async function call<T>(url: string, options: MetaFetchOptions): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch;
  for (let attempt = 1; ; attempt += 1) {
    if (options.deadline && Date.now() > options.deadline) throw new MetaApiError("Meta сұранымы уақытқа сыймады.", 0, null);
    let json: { error?: Record<string, unknown> } & T;
    try {
      const response = await doFetch(url, { signal: AbortSignal.timeout(90_000) });
      json = await response.json() as typeof json;
    } catch (cause) {
      if (attempt >= 3) throw new MetaApiError(`Meta API-ге қосылу болмады: ${cause instanceof Error ? cause.message : String(cause)}`, 0, null);
      const wait = attempt * 5_000;
      options.onWait?.(wait, attempt);
      await sleep(wait);
      continue;
    }
    if (!json.error) return json;
    const error = describe(json.error as Parameters<typeof describe>[0]);
    // Throttling is normal for insights: wait longer each time, then give up with Meta's own message.
    if (attempt < 4 && THROTTLED.has(error.code)) {
      const wait = attempt * 15_000;
      options.onWait?.(wait, attempt);
      await sleep(wait);
      continue;
    }
    throw error;
  }
}

function endpoint(path: string, params: Record<string, string | object>, token: string): string {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  url.searchParams.set("access_token", token);
  return url.toString();
}

/** Follows Meta's `paging.next` links until the list is complete. */
async function all<T>(path: string, params: Record<string, string | object>, options: MetaFetchOptions): Promise<T[]> {
  let response = await call<{ data?: T[]; paging?: { next?: string } }>(endpoint(path, params, options.token), options);
  const out = [...(response.data ?? [])];
  let guard = 0;
  while (response.paging?.next && guard++ < 200) {
    response = await call<{ data?: T[]; paging?: { next?: string } }>(response.paging.next, options);
    out.push(...(response.data ?? []));
  }
  return out;
}

export interface MetaTokenInfo {
  valid: boolean;
  type: string;
  appId: string;
  appName: string;
  /** null means the token does not expire — what a system-user token looks like. */
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  scopes: string[];
  userId: string;
}

export async function metaTokenInfo(options: MetaFetchOptions): Promise<MetaTokenInfo> {
  const res = await call<{ data?: Record<string, unknown> }>(endpoint("debug_token", { input_token: options.token }, options.token), options);
  const d = res.data ?? {};
  const stamp = (v: unknown) => (Number(v) > 0 ? new Date(Number(v) * 1000).toISOString() : null);
  return {
    valid: d.is_valid === true,
    type: String(d.type ?? ""),
    appId: String(d.app_id ?? ""),
    appName: String(d.application ?? ""),
    expiresAt: stamp(d.expires_at),
    dataAccessExpiresAt: stamp(d.data_access_expires_at),
    scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [],
    userId: String((d.user_id as string) ?? ""),
  };
}

export interface MetaRawAccount {
  id: string;
  name: string;
  currency: string;
  timezone_name?: string;
  account_status?: number;
  amount_spent?: string;
}

export function metaAdAccounts(options: MetaFetchOptions): Promise<MetaRawAccount[]> {
  return all<MetaRawAccount>("me/adaccounts", { fields: "id,name,currency,timezone_name,account_status,amount_spent", limit: "100" }, options);
}

const INSIGHT_FIELDS = "spend,impressions,reach,frequency,clicks,actions";

export interface MetaInsightQuery {
  accountId: string;
  from: string;
  to: string;
  /** "1" for one row per day, "monthly" for one row per month, "all_days" for a single total. */
  increment: "1" | "monthly" | "all_days";
  breakdowns?: string[];
}

export function metaInsights(query: MetaInsightQuery, options: MetaFetchOptions): Promise<MetaInsightRow[]> {
  const params: Record<string, string | object> = {
    fields: INSIGHT_FIELDS,
    time_range: { since: query.from, until: query.to },
    level: "account",
    limit: "500",
  };
  if (query.increment !== "all_days") params.time_increment = query.increment;
  if (query.breakdowns?.length) params.breakdowns = query.breakdowns;
  return all<MetaInsightRow>(`${query.accountId}/insights`, params, options);
}
