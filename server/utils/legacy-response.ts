import type { H3Event } from "h3";
import {
  getRequestHeaders,
  getRequestURL,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
} from "h3";

export async function webRequest(event: H3Event): Promise<Request> {
  const method = event.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await readRawBody(event);
  return new Request(getRequestURL(event), {
    method,
    headers: getRequestHeaders(event) as HeadersInit,
    body,
  });
}

export async function sendLegacyResponse(event: H3Event, response: Response) {
  setResponseStatus(event, response.status, response.statusText);
  response.headers.forEach((value, key) => setResponseHeader(event, key, value));
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}
