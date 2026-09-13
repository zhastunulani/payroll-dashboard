import { isRequestAuthenticated } from "../../lib/auth";
import { loadFinance } from "../../lib/finance-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  if(!await isRequestAuthenticated(await webRequest(event))) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  setHeader(event,"Cache-Control","no-store");
  return loadFinance(String(getQuery(event).period ?? new Date().toISOString().slice(0,7)));
});
