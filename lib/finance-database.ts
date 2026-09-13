import { getRawDb } from "./database";
import { FINANCE_SCHEMA } from "./finance-schema";
import { classifyFinanceCost, EMPTY_FINANCE_METRICS, financePeriod, normalizeFinanceEntry, normalizeFinanceMetrics, type FinanceEntry, type FinanceMetrics, type FinanceProject } from "./finance";

let ready: Promise<void> | null = null;
export function ensureFinanceDatabase() {
  ready ??= getRawDb().batch(FINANCE_SCHEMA.map(sql=>getRawDb().prepare(sql))).then(() => undefined).catch(e => { ready = null; throw e; });
  return ready;
}
type EntryRow = { id: string; workspace_id: string; period: string; name: string; category: FinanceEntry["category"]; amount: string | number | null; basis: FinanceEntry["basis"]; status: FinanceEntry["status"]; disposition: FinanceEntry["disposition"]; source: string; note: string; related_id: string; origin: FinanceEntry["origin"]; updated_at: string };
export function mapFinanceEntry(r: EntryRow): FinanceEntry {
  return { id: r.id, workspaceId: r.workspace_id, period: r.period, name: r.name, category: r.category,
    amount: r.amount === null ? null : Number(r.amount), basis: r.basis, status: r.status, disposition: r.disposition,
    source: r.source, note: r.note, relatedId: r.related_id, origin: r.origin, updatedAt: r.updated_at };
}
export async function loadFinance(periodInput: string) {
  const period = financePeriod(periodInput);
  await ensureFinanceDatabase();
  const db = getRawDb(), [year, month] = period.split("-").map(Number);
  const [projects, entries, metrics, salaries, expenses, legacy, periods, rules] = await Promise.all([
    db.prepare("SELECT id,name FROM workspaces ORDER BY sort_order,created_at").all<FinanceProject>(),
    db.prepare("SELECT * FROM finance_entries WHERE period = ? ORDER BY id").bind(period).all<EntryRow>(),
    db.prepare("SELECT workspace_id,data,updated_at FROM finance_metrics WHERE period = ?").bind(period).all<{workspace_id: string; data: string; updated_at: string}>(),
    db.prepare(`SELECT s.id,s.workspace_id,s.employee_name,s.department_name,s.base_salary,s.is_paid,s.note,
      COALESCE(SUM(CASE WHEN c.kind='addition' THEN c.amount ELSE -c.amount END),0) AS adjustment,
      COALESCE(SUM(CASE WHEN c.kind='deduction' AND LOWER(c.name) LIKE '%аванс%' THEN c.amount ELSE 0 END),0) AS advances
      FROM salary_snapshots s JOIN months m ON m.id=s.month_id LEFT JOIN salary_components c ON c.salary_snapshot_id=s.id
      WHERE m.year=? AND m.month=? GROUP BY s.id`).bind(year, month).all<{id:string;workspace_id:string;employee_name:string;department_name:string;base_salary:number;is_paid:number;note:string;adjustment:number;advances:number}>(),
    db.prepare(`SELECT e.* FROM expenses e JOIN months m ON m.id=e.month_id WHERE m.year=? AND m.month=?`).bind(year, month).all<{id:string;workspace_id:string;name:string;category_name:string;amount:number;is_paid:number}>(),
    db.prepare(`SELECT a.value,m.workspace_id FROM months m JOIN app_settings a ON a.key='unit_economics:' || m.workspace_id || ':' || m.id WHERE m.year=? AND m.month=?`).bind(year,month).all<{value:string;workspace_id:string}>(),
    db.prepare(`SELECT DISTINCT period FROM finance_entries UNION SELECT DISTINCT year::text || '-' || LPAD(month::text,2,'0') AS period FROM months UNION SELECT DISTINCT period FROM finance_metrics ORDER BY period DESC`).all<{period:string}>(),
    db.prepare("SELECT entry_id,behavior FROM finance_cost_rules WHERE period=?").bind(period).all<{entry_id:string;behavior:"fixed"|"variable"}>(),
  ]);
  const all: FinanceEntry[] = entries.results.map(mapFinanceEntry);
  const live = (values: Pick<FinanceEntry,"id"|"workspaceId"|"name"|"amount"|"category"|"status"|"origin"> & Partial<FinanceEntry>): FinanceEntry => ({
    period, basis: "actual", disposition: "included", source: "Payroll: ағымдағы есеп", note: "", relatedId: "", updatedAt: "", ...values,
  });
  for (const s of salaries.results) {
    const amount = Math.max(0,Number(s.base_salary)+Number(s.adjustment));
    all.push(live({id:`salary:${s.id}`,workspaceId:s.workspace_id,name:`${s.employee_name} · ${s.department_name}`,amount,category:"payroll",status:s.is_paid===1?"paid":"unpaid",origin:"salary",note:s.note||""}));
    if (Number(s.advances)>0) all.push(live({id:`advance:${s.id}`,workspaceId:s.workspace_id,name:`${s.employee_name} · аванс`,amount:Number(s.advances),category:"payroll",status:"unknown",origin:"salary",note:"Айлықтан шегерілген аванс. ФОТ құрамында; нақты төлем күні мен банк төлемін растау керек. Қайта төлеуге арналған сома емес."}));
  }
  for (const e of expenses.results) all.push(live({id:`expense:${e.id}`,workspaceId:e.workspace_id,name:e.name,amount:Number(e.amount),category:classifyFinanceCost(e.name,e.category_name),status:e.is_paid===1?"paid":"unpaid",origin:"expense",note:e.category_name}));
  for (const r of legacy.results) {
    const settings = JSON.parse(r.value);
    for (const [key,category,label] of [["marketingSpend","marketing","Таргет"],["payrollTaxes","tax","Салық"],["contractorPayments","contractors","Мердігер төлемдері"]] as const) {
      if (Number(settings[key])>0) {
        const id=`legacy:${r.workspace_id}:${period}:${category}`;
        const replacement=all.find(e=>e.relatedId===id && e.disposition==="included" && e.amount!==null);
        all.push(live({id,workspaceId:r.workspace_id,name:label,amount:Number(settings[key]),category,status:"unknown",origin:"legacy",
          disposition:replacement?"duplicate":"included",source:"Юнит-экономикадағы енгізілген дерек",
          note:`${settings.marketingPeriod||period}${replacement ? " · Нақты кезеңнің жаңа дерегімен ауыстырылды; қайта қосылмайды." : " · Төлем статусы расталмаған."}`}));
      }
    }
  }
  const metricMap: Record<string, FinanceMetrics> = {}, versions: Record<string,string> = {};
  for (const p of projects.results) metricMap[p.id]={...EMPTY_FINANCE_METRICS};
  // Only non-zero legacy inputs prove presence. Legacy defaults of zero are not reported zeros.
  for (const r of legacy.results) {
    const m=JSON.parse(r.value), target=metricMap[r.workspace_id]!;
    if(Number(m.revenue)>0) target.revenue=Number(m.revenue);
    if(Number(m.unitCount)>0) target.units=Number(m.unitCount);
    // Leads/CAC are not carried over: the legacy advertising period can differ from a calendar month.
  }
  for (const m of metrics.results) { metricMap[m.workspace_id]=normalizeFinanceMetrics(JSON.parse(m.data)); versions[m.workspace_id]=m.updated_at; }
  const ruleMap=new Map(rules.results.map(r=>[r.entry_id,r.behavior]));
  for(const e of all) e.costBehavior=ruleMap.get(e.id)??(e.category==="variable"?"variable":"fixed");
  return {period,projects:projects.results,entries:all,metrics:metricMap,metricVersions:versions,periods:periods.results.map(p=>p.period)};
}
export async function saveFinanceClassification(workspaceId:string,period:string,id:string,behavior:string){
  if(behavior!=="fixed"&&behavior!=="variable")throw new Error("Шығын түрі дұрыс емес.");
  const data=await loadFinance(period),entry=data.entries.find(e=>e.id===id&&e.workspaceId===workspaceId);
  if(!entry)throw new Error("Жазба табылмады.");
  const db=getRawDb();
  await db.batch([
    db.prepare(`INSERT INTO finance_history(id,record_id,previous_data) VALUES(?,?,?)`).bind(crypto.randomUUID(),`classification:${id}`,JSON.stringify({previous:entry.costBehavior,next:behavior})),
    db.prepare(`INSERT INTO finance_cost_rules(entry_id,workspace_id,period,behavior,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET behavior=excluded.behavior,period=excluded.period,updated_at=excluded.updated_at`).bind(id,workspaceId,period,behavior,new Date().toISOString()),
  ]);
}
export async function saveFinanceEntry(input: Partial<FinanceEntry>) {
  await ensureFinanceDatabase();
  const e=normalizeFinanceEntry(input), db=getRawDb();
  if(!await db.prepare("SELECT id FROM workspaces WHERE id=?").bind(e.workspaceId).first()) throw new Error("Жоба табылмады.");
  const id=input.id || crypto.randomUUID();
  const old=await db.prepare("SELECT * FROM finance_entries WHERE id=?").bind(id).first<EntryRow>();
  if(input.id && !old) throw new Error("Payroll жолын осы формада өзгертуге болмайды.");
  if(old && old.updated_at!==input.updatedAt) throw new Error("Бұл жазба өзгерген. Бетті жаңартып, қайта көріңіз.");
  const now=new Date().toISOString();
  if(old) {
    // An optimistic, single-statement update avoids lost changes and records history only when it wins.
    const result=await db.prepare(`WITH previous AS (SELECT * FROM finance_entries WHERE id=? AND updated_at=? FOR UPDATE),
      changed AS (UPDATE finance_entries SET workspace_id=?,period=?,name=?,category=?,amount=?,basis=?,status=?,disposition=?,source=?,note=?,related_id=?,updated_at=? WHERE id IN (SELECT id FROM previous) RETURNING id)
      INSERT INTO finance_history(id,record_id,previous_data) SELECT ?,previous.id,row_to_json(previous)::text FROM previous JOIN changed ON changed.id=previous.id`).bind(id,input.updatedAt,e.workspaceId,e.period,e.name,e.category,e.amount,e.basis,e.status,e.disposition,e.source,e.note,e.relatedId,now,crypto.randomUUID()).run();
    if(!result.meta.changes) throw new Error("Жазба қатар өзгертілген. Бетті жаңартыңыз.");
  } else await db.prepare(`INSERT INTO finance_entries(id,workspace_id,period,name,category,amount,basis,status,disposition,source,note,related_id,origin,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,e.workspaceId,e.period,e.name,e.category,e.amount,e.basis,e.status,e.disposition,e.source,e.note,e.relatedId,"manual",now).run();
  return id;
}
export async function saveFinanceMetrics(workspaceId: string, periodInput: string, input: Partial<FinanceMetrics>, version: string | null) {
  await ensureFinanceDatabase();
  const period=financePeriod(periodInput), data=JSON.stringify(normalizeFinanceMetrics(input)), db=getRawDb();
  if(!await db.prepare("SELECT id FROM workspaces WHERE id=?").bind(workspaceId).first()) throw new Error("Жоба табылмады.");
  const old=await db.prepare("SELECT * FROM finance_metrics WHERE workspace_id=? AND period=?").bind(workspaceId,period).first<{updated_at:string}>();
  if((old?.updated_at??null)!==version) throw new Error("Көрсеткіштер өзгерген. Бетті жаңартыңыз.");
  if (old) {
    const result=await db.prepare(`WITH previous AS (SELECT * FROM finance_metrics WHERE workspace_id=? AND period=? AND updated_at=? FOR UPDATE),
      changed AS (UPDATE finance_metrics SET data=?,updated_at=? WHERE workspace_id=? AND period=? AND updated_at=? AND EXISTS(SELECT 1 FROM previous) RETURNING workspace_id)
      INSERT INTO finance_history(id,record_id,previous_data) SELECT ?,?,row_to_json(previous)::text FROM previous JOIN changed ON changed.workspace_id=previous.workspace_id`)
      .bind(workspaceId,period,version,data,new Date().toISOString(),workspaceId,period,version,crypto.randomUUID(),`metrics:${workspaceId}:${period}`).run();
    if(!result.meta.changes) throw new Error("Көрсеткіштер қатар өзгертілген. Бетті жаңартыңыз.");
  } else {
    const result=await db.prepare("INSERT INTO finance_metrics(workspace_id,period,data,updated_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING").bind(workspaceId,period,data,new Date().toISOString()).run();
    if(!result.meta.changes) throw new Error("Көрсеткіштер қатар енгізілген. Бетті жаңартыңыз.");
  }
}
