import { POST } from "../../../app/api/auth/logout/route";
import { sendLegacyResponse, webRequest } from "../../utils/legacy-response";

export default defineEventHandler(async (event) => {
  const response = await POST(await webRequest(event));
  return sendLegacyResponse(event, response);
});
