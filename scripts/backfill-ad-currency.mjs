// Moves "X USD × Y ₸/USD" from imported advertising notes into the structured currency columns.
// Read-only preview by default. Only rows whose tenge amount equals USD × rate are touched; each change is kept in finance_history.
// Usage: node --experimental-transform-types --env-file=.env.local scripts/backfill-ad-currency.mjs [--apply]
import { neon } from "@neondatabase/serverless";
import { FINANCE_SCHEMA } from "../lib/finance-schema.ts";

const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
await sql.transaction(FINANCE_SCHEMA.map(statement => sql.query(statement)));
const rows = await sql.query(`SELECT * FROM finance_entries WHERE category='marketing' AND currency_amount IS NULL AND note ~ 'USD'`);
const pattern = /([\d]+(?:[.,]\d+)?)\s*USD\s*×\s*([\d]+(?:[.,]\d+)?)\s*₸\s*\/\s*USD/;
const plan = [];
for (const row of rows) {
  const match = pattern.exec(row.note);
  if (!match) continue;
  const usd = Number(match[1].replace(",", ".")), rate = Number(match[2].replace(",", "."));
  const derived = Math.round(usd * rate * 100) / 100;
  plan.push({ id: row.id, period: row.period, name: row.name, amount: Number(row.amount), usd, rate, matches: Math.abs(derived - Number(row.amount)) <= 0.01, row });
}
console.table(plan.map(item => ({ id: item.id, period: item.period, name: item.name, amount: item.amount, usd: item.usd, rate: item.rate, matches: item.matches })));
const safe = plan.filter(item => item.matches);
if (!apply) {
  console.log(`Preview: ${safe.length} row(s) can be updated. Re-run with --apply to write.`);
  process.exit(0);
}
const now = new Date().toISOString();
await sql.transaction(safe.flatMap(item => [
  sql.query("INSERT INTO finance_history(id,record_id,previous_data) VALUES($1,$2,$3)", [crypto.randomUUID(), item.id, JSON.stringify(item.row)]),
  sql.query("UPDATE finance_entries SET currency='USD',currency_amount=$1,fx_rate=$2,updated_at=$3 WHERE id=$4 AND updated_at=$5", [item.usd, item.rate, now, item.id, item.row.updated_at]),
]));
console.log(`Updated ${safe.length} row(s).`);
