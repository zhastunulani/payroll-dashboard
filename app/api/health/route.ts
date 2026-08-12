import { ensureDatabase, getRawDb } from "../../../lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatabase();
    const result = await getRawDb()
      .prepare("SELECT 1 AS healthy")
      .first<{ healthy: number }>();
    if (result?.healthy !== 1) throw new Error("Database health check failed.");
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
