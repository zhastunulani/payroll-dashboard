import { clearSessionCookie, isSecureRequest } from "@/lib/auth";

export async function POST(request: Request) {
  const secure = isSecureRequest(request);
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(secure),
        "Cache-Control": "no-store",
      },
    },
  );
}
