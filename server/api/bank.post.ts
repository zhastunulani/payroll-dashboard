import { isRequestAuthenticated } from "../../lib/auth";
import {
  applyBankRules, assignBankGroup, assignBankOperations, commentBankOperation, deleteBankRule, deleteBankStatement, processBankStatement, saveBankRule, saveCrmTotals,
} from "../../lib/bank-database";
import { webRequest } from "../utils/legacy-response";

export default defineEventHandler(async event => {
  const request=await webRequest(event);
  if(!await isRequestAuthenticated(request)) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  const origin=request.headers.get("origin");
  if(origin && new URL(origin).host!==request.headers.get("host")) throw createError({statusCode:403,statusMessage:"Origin mismatch"});
  const body=await request.json();
  try {
    switch(body.action) {
      // preview reads the file and shows what would be imported; nothing is saved.
      case "preview": return await processBankStatement({bank:body.bank,fileName:String(body.fileName ?? ""),data:String(body.data ?? ""),commit:false});
      case "import": return await processBankStatement({bank:body.bank,fileName:String(body.fileName ?? ""),data:String(body.data ?? ""),commit:true,force:body.force===true});
      case "assign": return {ok:true,changed:await assignBankOperations(Array.isArray(body.ids) ? body.ids : [],body.projectId ? String(body.projectId) : null,String(body.note ?? ""))};
      case "assignGroup": return {ok:true,changed:await assignBankGroup((Array.isArray(body.ids) ? body.ids : []).map(String),body.projectId ? String(body.projectId) : null,body.rule && typeof body.rule.pattern==="string" ? {field:body.rule.field,pattern:body.rule.pattern} : null)};
      case "resetToRules": return {ok:true,changed:await applyBankRules((Array.isArray(body.ids) ? body.ids : []).map(String),"Ережеге қайтарылды")};
      case "applyRules": return {ok:true,changed:await applyBankRules()};
      case "comment": await commentBankOperation(String(body.id),String(body.comment ?? "")); return {ok:true};
      case "saveRule": return {ok:true,...await saveBankRule(body.rule ?? {})};
      case "deleteRule": return {ok:true,changed:await deleteBankRule(String(body.id))};
      case "deleteStatement": await deleteBankStatement(String(body.id)); return {ok:true};
      case "crm": await saveCrmTotals(String(body.workspaceId),String(body.period),String(body.source),body.deals,body.amount); return {ok:true};
      default: throw new Error("Әрекет дұрыс емес.");
    }
  } catch(error) {
    throw createError({statusCode:400,message:error instanceof Error ? error.message : "Сақтау орындалмады."});
  }
});
