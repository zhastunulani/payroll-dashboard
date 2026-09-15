import { isRequestAuthenticated } from "../../lib/auth";
import { bankOperationHistory, loadBankData } from "../../lib/bank-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  if(!await isRequestAuthenticated(await webRequest(event))) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  setHeader(event,"Cache-Control","no-store");
  const query=getQuery(event);
  if(typeof query.history==="string") return bankOperationHistory(query.history);
  return loadBankData(String(query.period ?? new Date().toISOString().slice(0,7)));
});
