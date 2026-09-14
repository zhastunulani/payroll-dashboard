import { isRequestAuthenticated } from "../../lib/auth";
import { loadFinance, TREND_MONTHS } from "../../lib/finance-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  if(!await isRequestAuthenticated(await webRequest(event))) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  setHeader(event,"Cache-Control","no-store");
  const query=getQuery(event);
  // ?months=1 gives just the month itself (e.g. for the Payroll expenses page); the reports use the 6-month trend.
  const months=Math.max(1,Math.min(12,Number(query.months)||TREND_MONTHS));
  return loadFinance(String(query.period ?? new Date().toISOString().slice(0,7)),months);
});
