import { isRequestAuthenticated } from "../../lib/auth";
import { saveFinanceClassification, saveFinanceEntry, saveFinanceMetrics } from "../../lib/finance-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  const request=await webRequest(event);
  if(!await isRequestAuthenticated(request)) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  const origin=request.headers.get("origin");
  if(origin && new URL(origin).host!==request.headers.get("host")) throw createError({statusCode:403,statusMessage:"Origin mismatch"});
  const body=await request.json();
  try {
    if(body.action==="entry") await saveFinanceEntry(body.entry);
    else if(body.action==="metrics") await saveFinanceMetrics(String(body.workspaceId),String(body.period),body.metrics,body.version??null);
    else if(body.action==="classification") await saveFinanceClassification(String(body.workspaceId),String(body.period),String(body.id),String(body.behavior));
    else throw new Error("Әрекет дұрыс емес.");
    return {ok:true};
  } catch(error) {
    throw createError({statusCode:400,message:error instanceof Error ? error.message : "Сақтау орындалмады."});
  }
});
