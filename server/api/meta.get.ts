import { isRequestAuthenticated } from "../../lib/auth";
import { loadMeta } from "../../lib/meta-database";
import { metaMonthRange } from "../../lib/meta";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  if (!await isRequestAuthenticated(await webRequest(event))) throw createError({ statusCode: 401, statusMessage: "Сессия аяқталды." });
  setHeader(event, "Cache-Control", "no-store");
  const query = getQuery(event);
  const period = String(query.period ?? new Date().toISOString().slice(0, 7));
  // A window of months, so the target chart can show a half-year next to the current month.
  const months = Math.min(24, Math.max(1, Number(query.months) || 6));
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year!, month! - 1 - (months - 1), 1)).toISOString().slice(0, 7);
  return loadMeta(metaMonthRange(start).from, metaMonthRange(period).to);
});
