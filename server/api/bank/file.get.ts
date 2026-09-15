import { isRequestAuthenticated } from "../../../lib/auth";
import { bankStatementFile } from "../../../lib/bank-database";
import { webRequest } from "../../utils/legacy-response";

/** The original uploaded statement, exactly as it was received. */
export default defineEventHandler(async event => {
  if(!await isRequestAuthenticated(await webRequest(event))) throw createError({statusCode:401,statusMessage:"Сессия аяқталды."});
  const id=String(getQuery(event).id ?? "");
  try {
    const file=await bankStatementFile(id);
    setHeader(event,"Cache-Control","no-store");
    setHeader(event,"Content-Type",file.fileType==="pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setHeader(event,"Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return file.data;
  } catch(error) {
    throw createError({statusCode:404,message:error instanceof Error ? error.message : "Файл табылмады."});
  }
});
