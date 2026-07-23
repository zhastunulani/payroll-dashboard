import { hashPassword } from "@/lib/auth";
import { getSetting, runtimeEnv, setSetting } from "@/lib/database";

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      secret?: string;
      password?: string;
      version?: number;
    };
    const expectedSecret = runtimeEnv().PASSWORD_BOOTSTRAP_SECRET;
    if (
      !expectedSecret ||
      !body.secret ||
      (await fingerprint(body.secret)) !== (await fingerprint(expectedSecret))
    ) {
      return Response.json({ error: "Рұқсат жоқ." }, { status: 401 });
    }
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1) {
      return Response.json({ error: "Нұсқа дұрыс емес." }, { status: 400 });
    }
    const currentVersion = Number(
      (await getSetting("password_bootstrap_version")) ?? "0",
    );
    if (currentVersion >= version) {
      return Response.json(
        { error: "Бастапқы пароль бұрын орнатылған." },
        { status: 409 },
      );
    }
    const password = body.password ?? "";
    if (password.length < 10) {
      return Response.json(
        { error: "Пароль кемінде 10 таңба болуы керек." },
        { status: 400 },
      );
    }
    await setSetting("password_hash", await hashPassword(password));
    await setSetting("password_bootstrap_version", String(version));
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Бастапқы парольді орнату мүмкін болмады." },
      { status: 500 },
    );
  }
}
