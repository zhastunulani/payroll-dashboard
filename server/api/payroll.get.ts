import { GET } from "../../app/api/payroll/route";
import { sendLegacyResponse, webRequest } from "../utils/legacy-response";

export default defineEventHandler(async (event) => {
  const response = await GET(await webRequest(event));
  return sendLegacyResponse(event, response);
});
