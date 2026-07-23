import {
  configuredPasswordHash,
  createSessionToken,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const storedHash = await configuredPasswordHash();
    if (!storedHash) {
      return Response.json(
        { error: "Қосымша паролі әлі бапталмаған." },
        { status: 503 },
      );
    }
    if (!(await verifyPassword(body.password ?? "", storedHash))) {
      return Response.json({ error: "Пароль дұрыс емес." }, { status: 401 });
    }
    const token = await createSessionToken();
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie(token, secure) } },
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
