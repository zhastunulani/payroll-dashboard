export const FINANCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS finance_entries (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), period TEXT NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL, amount NUMERIC(18,2), basis TEXT NOT NULL,
    status TEXT NOT NULL, disposition TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    related_id TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT 'manual',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(amount IS NULL OR amount >= 0))`,
  "CREATE INDEX IF NOT EXISTS finance_entries_period_idx ON finance_entries(period, workspace_id)",
  // Original currency of a payment (e.g. advertising top-ups in USD). Additive and nullable.
  "ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'KZT'",
  "ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS currency_amount NUMERIC(18,2)",
  "ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18,6)",
  `CREATE TABLE IF NOT EXISTS finance_metrics (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), period TEXT NOT NULL, data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace_id, period))`,
  `CREATE TABLE IF NOT EXISTS finance_history (
    id TEXT PRIMARY KEY, record_id TEXT NOT NULL, previous_data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS finance_cost_rules (
    entry_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), period TEXT NOT NULL,
    behavior TEXT NOT NULL CHECK(behavior IN ('fixed','variable')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
];
