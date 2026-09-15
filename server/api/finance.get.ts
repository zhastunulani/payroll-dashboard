import { isRequestAuthenticated } from "../../lib/auth";
import { bankMonth } from "../../lib/bank-database";
import { loadFinance, TREND_MONTHS } from "../../lib/finance-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  if(!await isRequestAuthenticated(await webRequest(event))) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  setHeader(event,"Cache-Control","no-store");
  const query=getQuery(event);
  // ?months=1 gives just the month itself (e.g. for the Payroll expenses page); the reports use the 6-month trend.
  const months=Math.max(1,Math.min(12,Number(query.months)||TREND_MONTHS));
  const period=String(query.period ?? new Date().toISOString().slice(0,7));
  // Bank receipts are added for the reports; a failure there must not hide the ledger.
  const [data,bank]=await Promise.all([loadFinance(period,months),bankMonth(period).catch(()=>null)]);
  return {...data,bank};
});
