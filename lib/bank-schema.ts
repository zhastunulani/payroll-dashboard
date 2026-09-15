export const BANK_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bank_statements (
    id TEXT PRIMARY KEY, bank TEXT NOT NULL, file_name TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE,
    file_type TEXT NOT NULL, file_size INTEGER NOT NULL, file_data TEXT NOT NULL,
    legal_entity TEXT NOT NULL DEFAULT '', legal_entity_bin TEXT NOT NULL DEFAULT '', account TEXT NOT NULL DEFAULT '',
    period_from TEXT, period_to TEXT, operations_count INTEGER NOT NULL DEFAULT 0, duplicates_skipped INTEGER NOT NULL DEFAULT 0,
    checks TEXT NOT NULL DEFAULT '[]', warnings TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS bank_operations (
    id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL UNIQUE, bank TEXT NOT NULL,
    legal_entity TEXT NOT NULL DEFAULT '', legal_entity_bin TEXT NOT NULL DEFAULT '', account TEXT NOT NULL DEFAULT '',
    op_date TEXT NOT NULL, op_time TEXT NOT NULL DEFAULT '', credited_date TEXT,
    amount NUMERIC(18,2) NOT NULL, commission NUMERIC(18,2) NOT NULL DEFAULT 0, tax NUMERIC(18,2), vat NUMERIC(18,2),
    kind TEXT NOT NULL, type_raw TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL DEFAULT '', channel TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL DEFAULT '', counterparty TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    operation_no TEXT NOT NULL DEFAULT '', transaction_no TEXT NOT NULL DEFAULT '',
    project_id TEXT REFERENCES workspaces(id), suggested_project_id TEXT, assignment TEXT NOT NULL, rule_id TEXT,
    recon_status TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  "CREATE INDEX IF NOT EXISTS bank_operations_date_idx ON bank_operations(op_date)",
  "CREATE INDEX IF NOT EXISTS bank_operations_project_idx ON bank_operations(project_id, op_date)",
  `CREATE TABLE IF NOT EXISTS bank_rules (
    id TEXT PRIMARY KEY, field TEXT NOT NULL, pattern TEXT NOT NULL, project_id TEXT REFERENCES workspaces(id),
    approved INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 500, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS bank_history (
    id TEXT PRIMARY KEY, operation_id TEXT, statement_id TEXT, action TEXT NOT NULL,
    before_data TEXT, after_data TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  "CREATE INDEX IF NOT EXISTS bank_history_operation_idx ON bank_history(operation_id)",
  `CREATE TABLE IF NOT EXISTS bank_crm_totals (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), period TEXT NOT NULL, source TEXT NOT NULL,
    deals INTEGER, amount NUMERIC(18,2), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id, period, source))`,
];
