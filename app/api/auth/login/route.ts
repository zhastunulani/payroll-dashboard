import {
  configuredPasswordHash,
  createSessionToken,
  isSecureRequest,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";

const attempts = new Map<string, { failures: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

function requestIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const ip = requestIp(request);
    const now = Date.now();
    const currentAttempt = attempts.get(ip);
    if (
      currentAttempt &&
      currentAttempt.resetAt > now &&
      currentAttempt.failures >= MAX_FAILURES
    ) {
      return Response.json(
        { error: "Кіру әрекеті тым көп. 15 минуттан кейін қайталаңыз." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.ceil((currentAttempt.resetAt - now) / 1000),
            ),
          },
        },
      );
    }
    const body = (await request.json()) as { password?: string };
    const storedHash = await configuredPasswordHash();
    if (!storedHash) {
      return Response.json(
        { error: "Қосымша паролі әлі бапталмаған." },
        { status: 503 },
      );
    }
    if (!(await verifyPassword(body.password ?? "", storedHash))) {
      const activeAttempt =
        currentAttempt && currentAttempt.resetAt > now
          ? currentAttempt
          : { failures: 0, resetAt: now + ATTEMPT_WINDOW_MS };
      activeAttempt.failures += 1;
      attempts.set(ip, activeAttempt);
      return Response.json(
        { error: "Пароль дұрыс емес." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    attempts.delete(ip);
    const token = await createSessionToken();
    const secure = isSecureRequest(request);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(token, secure),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Кіру кезінде қате шықты.",
      },
      { status: 500 },
    );
  }
}
