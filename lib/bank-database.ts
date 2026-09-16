import { createHash } from "node:crypto";
import { getRawDb } from "./database";
import {
  assignOperation, BANK_LABELS, bankFacts, bankPeriod, builtinRules, counts, sourcesOf, dedupeKey, MANUAL_RULE, needsAssignment, reconStatusOf, RULE_FIELD_LABELS, summarizeBank,
  type BankAssignment, type BankCode, type BankOperation, type BankProject, type BankRule, type BankRuleField, type BankSummary, type ParsedStatement,
} from "./bank.ts";
import { detectBank, parseStatementFile } from "./bank-files.ts";
import { BANK_SCHEMA } from "./bank-schema.ts";

let ready: Promise<void> | null = null;
export function ensureBankDatabase() {
  ready ??= getRawDb().batch(BANK_SCHEMA.map(sql => getRawDb().prepare(sql))).then(() => undefined).catch(e => { ready = null; throw e; });
  return ready;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const num = (v: unknown) => v === null || v === undefined ? null : Number(v);

type OpRow = {
  id: string; statement_id: string; bank: BankCode; legal_entity: string; legal_entity_bin: string; account: string;
  op_date: string; op_time: string; credited_date: string | null; amount: string | number; commission: string | number;
  tax: string | number | null; vat: string | number | null; kind: BankOperation["kind"]; type_raw: string; payment_method: string;
  channel: string; purpose: string; counterparty: string; address: string; operation_no: string; transaction_no: string;
  project_id: string | null; suggested_project_id: string | null; assignment: BankAssignment; rule_id: string | null;
  recon_status: BankOperation["reconStatus"]; comment: string; updated_at: string;
};
export function mapBankOperation(r: OpRow): BankOperation {
  return {
    id: r.id, statementId: r.statement_id, bank: r.bank, legalEntity: r.legal_entity, legalEntityBin: r.legal_entity_bin, account: r.account,
    date: r.op_date, time: r.op_time, creditedDate: r.credited_date, amount: Number(r.amount), commission: Number(r.commission),
    tax: num(r.tax), vat: num(r.vat), kind: r.kind, typeRaw: r.type_raw, paymentMethod: r.payment_method, channel: r.channel,
    purpose: r.purpose, counterparty: r.counterparty, address: r.address, operationNo: r.operation_no, transactionNo: r.transaction_no,
    projectId: r.project_id, suggestedProjectId: r.suggested_project_id, assignment: r.assignment, ruleId: r.rule_id,
    reconStatus: r.recon_status, comment: r.comment, updatedAt: r.updated_at,
  };
}

export interface BankStatementInfo {
  id: string; bank: BankCode; fileName: string; fileType: string; fileSize: number; legalEntity: string; legalEntityBin: string;
  account: string; periodFrom: string | null; periodTo: string | null; operationsCount: number; duplicatesSkipped: number;
  checks: ParsedStatement["checks"]; warnings: string[]; status: "ok" | "mismatch"; uploadedAt: string;
}
type StatementRow = {
  id: string; bank: BankCode; file_name: string; file_type: string; file_size: number; legal_entity: string; legal_entity_bin: string;
  account: string; period_from: string | null; period_to: string | null; operations_count: number; duplicates_skipped: number;
  checks: string; warnings: string; status: "ok" | "mismatch"; uploaded_at: string;
};
const mapStatement = (r: StatementRow): BankStatementInfo => ({
  id: r.id, bank: r.bank, fileName: r.file_name, fileType: r.file_type, fileSize: Number(r.file_size), legalEntity: r.legal_entity,
  legalEntityBin: r.legal_entity_bin, account: r.account, periodFrom: r.period_from, periodTo: r.period_to,
  operationsCount: Number(r.operations_count), duplicatesSkipped: Number(r.duplicates_skipped),
  checks: JSON.parse(r.checks || "[]"), warnings: JSON.parse(r.warnings || "[]"), status: r.status, uploadedAt: r.uploaded_at,
});

export async function bankProjects(): Promise<BankProject[]> {
  const rows = await getRawDb().prepare("SELECT id, name FROM workspaces ORDER BY sort_order, created_at").all<BankProject>();
  return rows.results;
}

type RuleRow = { id: string; field: BankRuleField; pattern: string; project_id: string | null; approved: number; priority: number; note: string };
async function ownerRules(): Promise<BankRule[]> {
  const rows = await getRawDb().prepare("SELECT * FROM bank_rules ORDER BY priority DESC, created_at").all<RuleRow>();
  return rows.results.map(r => ({ id: r.id, field: r.field, pattern: r.pattern, projectId: r.project_id, approved: !!Number(r.approved), priority: Number(r.priority), note: r.note }));
}
async function allRules(projects: BankProject[]) {
  return [...await ownerRules(), ...builtinRules(projects)];
}

/* ---------------- Upload: preview (nothing is saved) and import ---------------- */

export interface BankUploadResult {
  committed: boolean;
  statementId: string | null;
  bank: BankCode;
  fileName: string;
  legalEntity: string;
  legalEntityBin: string;
  account: string;
  periodFrom: string | null;
  periodTo: string | null;
  checks: ParsedStatement["checks"];
  checksOk: boolean;
  warnings: string[];
  total: number;
  fresh: number;
  duplicates: number;
  groups: { projectId: string | null; suggestedProjectId: string | null; assignment: BankAssignment; count: number; amount: number }[];
  summary: BankSummary;
  review: BankOperation[];
}

export async function processBankStatement(input: { bank: BankCode; fileName: string; data: string; commit: boolean; force?: boolean }): Promise<BankUploadResult> {
  await ensureBankDatabase();
  const db = getRawDb();
  if (input.bank !== "kaspi" && input.bank !== "halyk") throw new Error("Банк таңдалмаған.");
  const bytes = new Uint8Array(Buffer.from(input.data || "", "base64"));
  if (!bytes.length) throw new Error("Файл бос.");
  if (bytes.length > MAX_FILE_BYTES) throw new Error("Файл тым үлкен (15 МБ-тан аспауы керек).");
  const detected = detectBank(bytes);
  if (detected && detected !== input.bank) throw new Error(`Бұл файл ${BANK_LABELS[detected]} форматына ұқсайды. Банкті дұрыс таңдаңыз.`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const existing = await db.prepare("SELECT file_name, uploaded_at FROM bank_statements WHERE file_hash=?").bind(hash).first<{ file_name: string; uploaded_at: string }>();
  if (existing) throw new Error(`Бұл файл бұрын жүктелген: «${existing.file_name}», ${existing.uploaded_at.slice(0, 16).replace("T", " ")}.`);

  let parsed: ParsedStatement;
  try {
    parsed = await parseStatementFile(input.bank, bytes);
  } catch (error) {
    throw new Error(`Файл оқылмады: ${error instanceof Error ? error.message : "белгісіз қате"}`, { cause: error });
  }
  if (!parsed.operations.length) throw new Error("Файлда бірде-бір операция табылмады.");
  const checksOk = parsed.checks.length > 0 && parsed.checks.every(c => c.ok);
  if (input.commit && !checksOk && !input.force) throw new Error("Файлдағы итогтар операциялармен сәйкес келмейді. Алдын ала қарауды тексеріңіз.");

  const projects = await bankProjects();
  const rules = await allRules(projects);
  const keys = parsed.operations.map(dedupeKey);
  const known = new Set<string>();
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const rows = await db.prepare("SELECT dedupe_key FROM bank_operations WHERE dedupe_key = ANY(?::text[])").bind(chunk).all<{ dedupe_key: string }>();
    rows.results.forEach(r => known.add(r.dedupe_key));
  }
  const statementId = crypto.randomUUID();
  const now = new Date().toISOString();
  const fresh: (BankOperation & { key: string })[] = [];
  parsed.operations.forEach((op, index) => {
    const key = keys[index]!;
    if (known.has(key)) return;
    known.add(key);
    // A statement whose totals do not add up is kept for review only.
    const assignment = checksOk ? assignOperation(op, rules) : { projectId: null, suggestedProjectId: null, assignment: "review" as const, ruleId: null };
    const full: BankOperation = { ...op, id: crypto.randomUUID(), statementId, ...assignment, reconStatus: "bank_only", comment: "", updatedAt: now };
    fresh.push({ ...full, reconStatus: reconStatusOf(full), key });
  });

  const groups = new Map<string, BankUploadResult["groups"][number]>();
  for (const op of fresh) {
    const id = `${op.assignment}|${op.projectId ?? op.suggestedProjectId ?? ""}`;
    const g = groups.get(id) ?? { projectId: op.projectId, suggestedProjectId: op.suggestedProjectId, assignment: op.assignment, count: 0, amount: 0 };
    g.count += 1;
    g.amount += op.kind === "sale" || op.kind === "settlement" ? op.amount : 0;
    groups.set(id, g);
  }
  const result: BankUploadResult = {
    committed: false, statementId: null, bank: parsed.bank, fileName: input.fileName, legalEntity: parsed.legalEntity,
    legalEntityBin: parsed.legalEntityBin, account: parsed.account, periodFrom: parsed.periodFrom, periodTo: parsed.periodTo,
    checks: parsed.checks, checksOk, warnings: parsed.warnings, total: parsed.operations.length, fresh: fresh.length,
    duplicates: parsed.operations.length - fresh.length, groups: [...groups.values()].sort((a, b) => b.amount - a.amount),
    summary: summarizeBank(fresh.filter(counts)), review: fresh.filter(needsAssignment).slice(0, 40).map(({ key: _key, ...op }) => op),
  };
  if (!input.commit) return result;

  const extension = input.bank === "kaspi" ? "xlsx" : "pdf";
  const statements = [
    db.prepare(`INSERT INTO bank_statements(id,bank,file_name,file_hash,file_type,file_size,file_data,legal_entity,legal_entity_bin,account,period_from,period_to,operations_count,duplicates_skipped,checks,warnings,status,uploaded_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(statementId, input.bank, input.fileName.slice(0, 200) || `statement.${extension}`, hash, extension, bytes.length, Buffer.from(bytes).toString("base64"),
        parsed.legalEntity, parsed.legalEntityBin, parsed.account, parsed.periodFrom, parsed.periodTo, fresh.length, result.duplicates,
        JSON.stringify(parsed.checks), JSON.stringify(parsed.warnings), checksOk ? "ok" : "mismatch", now),
  ];
  const columns = ["id", "statement_id", "dedupe_key", "bank", "legal_entity", "legal_entity_bin", "account", "op_date", "op_time", "credited_date", "amount", "commission", "tax", "vat", "kind", "type_raw", "payment_method", "channel", "purpose", "counterparty", "address", "operation_no", "transaction_no", "project_id", "suggested_project_id", "assignment", "rule_id", "recon_status", "updated_at"];
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const values = chunk.flatMap(o => [o.id, statementId, o.key, o.bank, o.legalEntity, o.legalEntityBin, o.account, o.date, o.time, o.creditedDate, o.amount, o.commission, o.tax, o.vat, o.kind, o.typeRaw, o.paymentMethod, o.channel, o.purpose, o.counterparty, o.address, o.operationNo, o.transactionNo, o.projectId, o.suggestedProjectId, o.assignment, o.ruleId, o.reconStatus, now]);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    statements.push(db.prepare(`INSERT INTO bank_operations(${columns.join(",")}) VALUES ${placeholders} ON CONFLICT (dedupe_key) DO NOTHING`).bind(...values));
  }
  statements.push(db.prepare("INSERT INTO bank_history(id,statement_id,action,after_data,note) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), statementId, "import", JSON.stringify({ fileName: input.fileName, bank: input.bank, operations: fresh.length, duplicates: result.duplicates, checksOk }), checksOk ? "" : "Итогтар сәйкес келмеді, бәрібір импортталды"));
  await db.batch(statements);
  // Keep the POS detail and the account-statement batches from counting the same money twice.
  await reconcilePosSettlements().catch(() => null);
  return { ...result, committed: true, statementId };
}

/* ---------------- Reading ---------------- */

export interface BankData {
  period: string;
  projects: BankProject[];
  statements: BankStatementInfo[];
  operations: BankOperation[];
  rules: BankRule[];
  crm: { workspaceId: string; period: string; source: string; deals: number | null; amount: number | null }[];
  lastUpdated: string | null;
}

const monthRange = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${period}-01`, `${next}-01`] as const;
};

export async function loadBankData(periodInput: string): Promise<BankData> {
  await ensureBankDatabase();
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodInput) ? periodInput : new Date().toISOString().slice(0, 7);
  const [from, to] = monthRange(period);
  const db = getRawDb();
  const [projects, statements, operations, rules, crm] = await Promise.all([
    bankProjects(),
    db.prepare(`SELECT id,bank,file_name,file_type,file_size,legal_entity,legal_entity_bin,account,period_from,period_to,operations_count,duplicates_skipped,checks,warnings,status,uploaded_at
      FROM bank_statements ORDER BY uploaded_at DESC`).all<StatementRow>(),
    db.prepare("SELECT * FROM bank_operations WHERE op_date >= ? AND op_date < ? ORDER BY op_date DESC, op_time DESC").bind(from, to).all<OpRow>(),
    ownerRules(),
    db.prepare("SELECT workspace_id, period, source, deals, amount FROM bank_crm_totals WHERE period=?").bind(period).all<{ workspace_id: string; period: string; source: string; deals: number | null; amount: string | null }>(),
  ]);
  const list = statements.results.map(mapStatement);
  return {
    period, projects, statements: list,
    operations: operations.results.map(mapBankOperation),
    rules: [...rules, ...builtinRules(projects)],
    crm: crm.results.map(r => ({ workspaceId: r.workspace_id, period: r.period, source: r.source, deals: num(r.deals), amount: num(r.amount) })),
    lastUpdated: list[0]?.uploadedAt ?? null,
  };
}

export type BankMonth = { byProject: Record<string, BankSummary>; pending: { count: number; amount: number }; lastUpdated: string | null; coveredTo: string | null };
/** Actual receipts per project for a month, for the reports. Unassigned operations are reported apart. */
export async function bankMonth(period: string): Promise<BankMonth | null> {
  await ensureBankDatabase();
  const [from, to] = monthRange(period);
  const db = getRawDb();
  const [rows, latest] = await Promise.all([
    db.prepare("SELECT * FROM bank_operations WHERE op_date >= ? AND op_date < ?").bind(from, to).all<OpRow>(),
    db.prepare("SELECT MAX(uploaded_at) AS uploaded_at, MAX(period_to) AS period_to FROM bank_statements").first<{ uploaded_at: string | null; period_to: string | null }>(),
  ]);
  const ops = rows.results.map(mapBankOperation);
  if (!ops.length) return latest?.uploaded_at ? { byProject: {}, pending: { count: 0, amount: 0 }, lastUpdated: latest.uploaded_at, coveredTo: latest.period_to } : null;
  const byProject: Record<string, BankSummary> = {};
  const ids = [...new Set(ops.filter(counts).map(o => o.projectId!))];
  for (const id of ids) byProject[id] = summarizeBank(ops.filter(o => counts(o) && o.projectId === id));
  const waiting = ops.filter(needsAssignment);
  return {
    byProject,
    pending: { count: waiting.length, amount: waiting.filter(o => o.kind === "sale" || o.kind === "settlement").reduce((a, o) => a + o.amount, 0) },
    lastUpdated: latest?.uploaded_at ?? null, coveredTo: latest?.period_to ?? null,
  };
}

/** Bank facts per project and month for a window of months (YYYY-MM … YYYY-MM), for revenue and trends. */
export async function bankFactsWindow(fromPeriod: string, toPeriod: string): Promise<Record<string, Record<string, ReturnType<typeof bankFacts>>>> {
  await ensureBankDatabase();
  const [from] = monthRange(fromPeriod), [, to] = monthRange(toPeriod);
  const rows = await getRawDb().prepare("SELECT * FROM bank_operations WHERE op_date >= ? AND op_date < ? AND assignment IN ('auto','manual') AND project_id IS NOT NULL").bind(from, to).all<OpRow>();
  const groups = new Map<string, BankOperation[]>();
  for (const op of rows.results.map(mapBankOperation)) {
    const key = `${op.projectId}|${bankPeriod(op.date)}`;
    groups.set(key, [...groups.get(key) ?? [], op]);
  }
  const result: Record<string, Record<string, ReturnType<typeof bankFacts>>> = {};
  for (const [key, ops] of groups) {
    const [project, period] = key.split("|") as [string, string];
    (result[project] ??= {})[period] = bankFacts(summarizeBank(ops), sourcesOf(ops));
  }
  return result;
}

/* ---------------- Changes (each one journaled) ---------------- */

const RECON_SQL = `CASE WHEN o.kind='refund' THEN 'refund' WHEN o.kind='commission' THEN 'commission' WHEN o.kind='tax' THEN 'tax' ELSE 'bank_only' END`;

/** A person's decision for one or more operations: a project, or «not a project». */
export async function assignBankOperations(ids: string[], projectId: string | null, note: string) {
  await ensureBankDatabase();
  const list = [...new Set(ids.map(String))].slice(0, 2000);
  if (!list.length) throw new Error("Операция таңдалмаған.");
  const db = getRawDb();
  if (projectId && !await db.prepare("SELECT id FROM workspaces WHERE id=?").bind(projectId).first()) throw new Error("Жоба табылмады.");
  const assignment: BankAssignment = projectId ? "manual" : "excluded";
  const now = new Date().toISOString();
  const result = await db.prepare(`WITH previous AS (SELECT id, project_id, assignment FROM bank_operations WHERE id = ANY(?::text[]) AND assignment <> 'duplicate' FOR UPDATE),
    changed AS (UPDATE bank_operations o SET project_id=?, suggested_project_id=NULL, assignment=?, rule_id=?, recon_status=${RECON_SQL}, updated_at=?
      FROM previous WHERE o.id = previous.id RETURNING o.id, o.project_id, o.assignment)
    INSERT INTO bank_history(id, operation_id, action, before_data, after_data, note)
    SELECT gen_random_uuid()::text, previous.id, 'assign',
      json_build_object('projectId', previous.project_id, 'assignment', previous.assignment)::text,
      json_build_object('projectId', changed.project_id, 'assignment', changed.assignment)::text, ?
    FROM previous JOIN changed ON changed.id = previous.id`)
    .bind(list, projectId, assignment, projectId ? null : MANUAL_RULE, now, note.slice(0, 500)).run();
  return result.meta.changes;
}

/**
 * Re-applies the rules. Without ids: every operation that no person has decided. With ids: those operations,
 * including manual ones (the «back to rules» action). Only operations whose result changes are written and journaled.
 */
export async function applyBankRules(ids?: string[], note = "Ережелер қайта қолданылды") {
  await ensureBankDatabase();
  const db = getRawDb();
  const projects = await bankProjects();
  const rules = await allRules(projects);
  const rows = ids?.length
    ? await db.prepare("SELECT * FROM bank_operations WHERE id = ANY(?::text[]) AND assignment <> 'duplicate'").bind(ids).all<OpRow>()
    : await db.prepare("SELECT * FROM bank_operations WHERE assignment NOT IN ('manual','duplicate') AND COALESCE(rule_id,'') <> ?").bind(MANUAL_RULE).all<OpRow>();
  const statuses = new Map((await db.prepare("SELECT id, status FROM bank_statements").all<{ id: string; status: string }>()).results.map(r => [r.id, r.status]));
  const changes: RuleChange[] = [];
  for (const row of rows.results) {
    const op = mapBankOperation(row);
    // Operations of a statement whose totals did not add up stay in review until a person decides.
    const base = ids?.length ? { ...op, assignment: "auto" as const, ruleId: null } : op;
    const next = statuses.get(op.statementId) === "mismatch" && !ids?.length
      ? { projectId: null, suggestedProjectId: null, assignment: "review" as const, ruleId: null }
      : assignOperation(base, rules);
    if (next.projectId === op.projectId && next.assignment === op.assignment && next.suggestedProjectId === op.suggestedProjectId && next.ruleId === op.ruleId) continue;
    changes.push({ id: op.id, projectId: next.projectId, suggested: next.suggestedProjectId, assignment: next.assignment, ruleId: next.ruleId, recon: reconStatusOf({ kind: op.kind, assignment: next.assignment }) });
  }
  if (!changes.length) return 0;
  const now = new Date().toISOString();
  for (let i = 0; i < changes.length; i += 1000) await rulesUpdate(changes.slice(i, i + 1000), now, note).run();
  return changes.length;
}

export type RuleChange = { id: string; projectId: string | null; suggested: string | null; assignment: BankAssignment; ruleId: string | null; recon: string };
/**
 * One set-based update of many operations, journaling each changed one. The UPDATE joins `previous` so the old
 * values are read (and locked) before the rows change; otherwise Postgres may skip rows this statement already updated.
 */
export function rulesUpdate(chunk: RuleChange[], now: string, note: string) {
  return getRawDb().prepare(`WITH v AS (SELECT * FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(id, project_id, suggested, assignment, rule_id, recon)),
    previous AS (SELECT o.id, o.project_id, o.assignment FROM bank_operations o WHERE o.id IN (SELECT id FROM v) FOR UPDATE),
    changed AS (UPDATE bank_operations o SET project_id=v.project_id, suggested_project_id=v.suggested, assignment=v.assignment, rule_id=v.rule_id, recon_status=v.recon, updated_at=?
      FROM v JOIN previous ON previous.id = v.id WHERE o.id = v.id RETURNING o.id, o.project_id, o.assignment)
    INSERT INTO bank_history(id, operation_id, action, before_data, after_data, note)
    SELECT gen_random_uuid()::text, previous.id, 'rules',
      json_build_object('projectId', previous.project_id, 'assignment', previous.assignment)::text,
      json_build_object('projectId', changed.project_id, 'assignment', changed.assignment)::text, ?
    FROM previous JOIN changed ON changed.id = previous.id`)
    .bind(chunk.map(c => c.id), chunk.map(c => c.projectId), chunk.map(c => c.suggested), chunk.map(c => c.assignment), chunk.map(c => c.ruleId), chunk.map(c => c.recon), now, note);
}

/**
 * «Бөлу керек»: one decision for a group of waiting operations (same address or contract). With a rule, the decision is
 * remembered for future statements too; operations the rule does not catch are assigned by hand.
 */
export async function assignBankGroup(ids: string[], projectId: string | null, rule: Pick<BankRule, "field" | "pattern"> | null) {
  await ensureBankDatabase();
  let changed = 0;
  if (rule) changed += (await saveBankRule({ ...rule, projectId, approved: true, priority: 600, note: "«Бөлу керек» тізімінен" })).changed;
  const still = await getRawDb().prepare("SELECT id FROM bank_operations WHERE id = ANY(?::text[]) AND assignment IN ('review','unknown')").bind(ids).all<{ id: string }>();
  if (still.results.length) changed += await assignBankOperations(still.results.map(r => r.id), projectId, "«Бөлу керек» тізімінен қолмен");
  return changed;
}

/**
 * The account statement prints one «Расчеты по карточкам» batch per day, while the POS statement lists the sales
 * inside it. Where both exist for the same contract and credit date, the batch is marked a duplicate so the money
 * is counted once; if the POS statement is later deleted, the batch comes back through the rules.
 */
export async function reconcilePosSettlements() {
  await ensureBankDatabase();
  const db = getRawDb();
  const contract = "substring(channel from 'договор ([^ ·]+)')";
  const covered = `EXISTS (SELECT 1 FROM bank_operations p WHERE p.bank='halyk' AND p.kind IN ('sale','refund','commission')
    AND p.credited_date = o.credited_date AND ${contract.replace(/channel/g, "p.channel")} IS NOT DISTINCT FROM ${contract.replace(/channel/g, "o.channel")})`;
  const marked = await db.prepare(`WITH previous AS (SELECT id, assignment, project_id FROM bank_operations o
      WHERE o.bank='halyk' AND o.kind='settlement' AND o.assignment NOT IN ('duplicate','manual') AND o.credited_date IS NOT NULL AND ${covered} FOR UPDATE),
    changed AS (UPDATE bank_operations o SET assignment='duplicate', recon_status='duplicate', updated_at=?
      FROM previous WHERE o.id = previous.id RETURNING o.id)
    INSERT INTO bank_history(id, operation_id, action, before_data, after_data, note)
    SELECT gen_random_uuid()::text, previous.id, 'pos', json_build_object('assignment', previous.assignment)::text,
      json_build_object('assignment', 'duplicate')::text, 'POS выпискасында жеке сатылымдары бар: қайталанбау үшін есептен шығарылды'
    FROM previous JOIN changed ON changed.id = previous.id`).bind(new Date().toISOString()).run();
  const restored = await db.prepare(`SELECT id FROM bank_operations o WHERE o.bank='halyk' AND o.kind='settlement' AND o.assignment='duplicate' AND NOT ${covered}`)
    .all<{ id: string }>();
  if (restored.results.length) await applyBankRules(restored.results.map(r => r.id), "POS выпискасы жоқ: қайта есепке алынды");
  return { marked: marked.meta.changes, restored: restored.results.length };
}

export async function commentBankOperation(id: string, comment: string) {
  await ensureBankDatabase();
  const text = comment.trim().slice(0, 1000);
  const result = await getRawDb().prepare(`WITH previous AS (SELECT id, comment FROM bank_operations WHERE id=? FOR UPDATE),
    changed AS (UPDATE bank_operations o SET comment=?, updated_at=? FROM previous WHERE o.id = previous.id RETURNING o.id)
    INSERT INTO bank_history(id, operation_id, action, before_data, after_data) SELECT gen_random_uuid()::text, previous.id, 'comment',
      json_build_object('comment', previous.comment)::text, json_build_object('comment', ?::text)::text FROM previous JOIN changed ON changed.id = previous.id`)
    .bind(id, text, new Date().toISOString(), text).run();
  if (!result.meta.changes) throw new Error("Операция табылмады.");
}

export async function saveBankRule(input: Partial<BankRule>) {
  await ensureBankDatabase();
  const field = String(input.field) as BankRuleField;
  if (!Object.hasOwn(RULE_FIELD_LABELS, field)) throw new Error("Ереже өрісі дұрыс емес.");
  const pattern = String(input.pattern ?? "").trim();
  if (pattern.length < 2) throw new Error("Ереже мәтіні кемінде 2 таңба болуы керек.");
  const db = getRawDb();
  const projectId = input.projectId ? String(input.projectId) : null;
  if (projectId && !await db.prepare("SELECT id FROM workspaces WHERE id=?").bind(projectId).first()) throw new Error("Жоба табылмады.");
  const id = input.id && !String(input.id).startsWith("builtin-") ? String(input.id) : crypto.randomUUID();
  const priority = Math.max(1, Math.min(9999, Math.round(Number(input.priority) || 500)));
  await db.prepare(`INSERT INTO bank_rules(id, field, pattern, project_id, approved, priority, note) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET field=EXCLUDED.field, pattern=EXCLUDED.pattern, project_id=EXCLUDED.project_id, approved=EXCLUDED.approved, priority=EXCLUDED.priority, note=EXCLUDED.note`)
    .bind(id, field, pattern.slice(0, 200), projectId, input.approved === false ? 0 : 1, priority, String(input.note ?? "").slice(0, 300)).run();
  return { id, changed: await applyBankRules(undefined, `Ереже: ${RULE_FIELD_LABELS[field]} «${pattern}»`) };
}

export async function deleteBankRule(id: string) {
  await ensureBankDatabase();
  if (id.startsWith("builtin-")) throw new Error("Жүйелік ережені өшіруге болмайды; оның орнына өз ережеңізді қосыңыз.");
  await getRawDb().prepare("DELETE FROM bank_rules WHERE id=?").bind(id).run();
  return applyBankRules(undefined, "Ереже өшірілді");
}

/** Removes a wrong upload with its operations; the journal keeps what was removed. */
export async function deleteBankStatement(id: string) {
  await ensureBankDatabase();
  const db = getRawDb();
  const row = await db.prepare("SELECT id, bank, file_name, legal_entity, period_from, period_to, operations_count FROM bank_statements WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!row) throw new Error("Жүктеу табылмады.");
  await db.batch([
    db.prepare("INSERT INTO bank_history(id, statement_id, action, before_data, note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), id, "delete", JSON.stringify(row), "Жүктеу өшірілді"),
    db.prepare("DELETE FROM bank_operations WHERE statement_id=?").bind(id),
    db.prepare("DELETE FROM bank_statements WHERE id=?").bind(id),
  ]);
  await reconcilePosSettlements().catch(() => null);
}

export async function saveCrmTotals(workspaceId: string, period: string, source: string, deals: unknown, amount: unknown) {
  await ensureBankDatabase();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Кезең дұрыс емес.");
  if (source !== "amocrm" && source !== "crm_eduser") throw new Error("Дереккөз дұрыс емес.");
  const toNumber = (v: unknown) => v === null || v === undefined || v === "" ? null : Number(v);
  const d = toNumber(deals), a = toNumber(amount);
  if ((d !== null && (!Number.isFinite(d) || d < 0)) || (a !== null && (!Number.isFinite(a) || a < 0))) throw new Error("Сан дұрыс емес.");
  await getRawDb().prepare(`INSERT INTO bank_crm_totals(workspace_id, period, source, deals, amount, updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT (workspace_id, period, source) DO UPDATE SET deals=EXCLUDED.deals, amount=EXCLUDED.amount, updated_at=EXCLUDED.updated_at`)
    .bind(workspaceId, period, source, d === null ? null : Math.round(d), a, new Date().toISOString()).run();
}

export async function bankStatementFile(id: string) {
  await ensureBankDatabase();
  const row = await getRawDb().prepare("SELECT file_name, file_type, file_data FROM bank_statements WHERE id=?").bind(id).first<{ file_name: string; file_type: string; file_data: string }>();
  if (!row) throw new Error("Файл табылмады.");
  return { fileName: row.file_name, fileType: row.file_type, data: Buffer.from(row.file_data, "base64") };
}

export async function bankOperationHistory(id: string) {
  await ensureBankDatabase();
  const rows = await getRawDb().prepare("SELECT action, before_data, after_data, note, created_at FROM bank_history WHERE operation_id=? ORDER BY created_at DESC LIMIT 50").bind(id)
    .all<{ action: string; before_data: string | null; after_data: string | null; note: string; created_at: string }>();
  return rows.results.map(r => ({ action: r.action, before: r.before_data ? JSON.parse(r.before_data) : null, after: r.after_data ? JSON.parse(r.after_data) : null, note: r.note, createdAt: r.created_at }));
}
