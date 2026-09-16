export const META_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta_accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'USD',
    timezone TEXT NOT NULL DEFAULT '', status INTEGER NOT NULL DEFAULT 0,
    project_id TEXT REFERENCES workspaces(id), tracked INTEGER NOT NULL DEFAULT 1,
    spend_lifetime NUMERIC(18,2), note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  // One row per account-day: what the target section charts.
  `CREATE TABLE IF NOT EXISTS meta_daily (
    account_id TEXT NOT NULL REFERENCES meta_accounts(id) ON DELETE CASCADE, day TEXT NOT NULL,
    spend NUMERIC(18,2) NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0, conversations INTEGER NOT NULL DEFAULT 0, leads INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(account_id, day))`,
  "CREATE INDEX IF NOT EXISTS meta_daily_day_idx ON meta_daily(day)",
  // Meta's own monthly aggregate: the only place a real (deduplicated) reach comes from.
  `CREATE TABLE IF NOT EXISTS meta_period (
    account_id TEXT NOT NULL REFERENCES meta_accounts(id) ON DELETE CASCADE, period TEXT NOT NULL,
    spend NUMERIC(18,2) NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0, conversations INTEGER NOT NULL DEFAULT 0, leads INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(account_id, period))`,
  // Where the money went geographically: the evidence for splitting one pooled account between projects.
  `CREATE TABLE IF NOT EXISTS meta_region_daily (
    account_id TEXT NOT NULL REFERENCES meta_accounts(id) ON DELETE CASCADE, day TEXT NOT NULL, region TEXT NOT NULL,
    -- Six decimals on purpose: Meta apportions the day's spend, and cents-rounding each region loses money.
    spend NUMERIC(18,6) NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, reach INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0, conversations INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(account_id, day, region))`,
  "CREATE INDEX IF NOT EXISTS meta_region_daily_day_idx ON meta_region_daily(day)",
  // ₸ per USD for a month. Never guessed: the owner enters it, or it is read from the ledger.
  `CREATE TABLE IF NOT EXISTS meta_fx_rates (
    period TEXT PRIMARY KEY, rate NUMERIC(12,4) NOT NULL, source TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS meta_sync_runs (
    id TEXT PRIMARY KEY, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT,
    status TEXT NOT NULL, accounts INTEGER NOT NULL DEFAULT 0, days INTEGER NOT NULL DEFAULT 0,
    range_from TEXT NOT NULL DEFAULT '', range_to TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '')`,
];
