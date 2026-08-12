import { ensureDatabase, getRawDb } from "../../lib/database";

export default defineEventHandler(async (event) => {
  try {
    await ensureDatabase();
    const result = await getRawDb()
      .prepare("SELECT 1 AS healthy")
      .first<{ healthy: number }>();
    if (result?.healthy !== 1) throw new Error("Database health check failed.");
    setHeader(event, "Cache-Control", "no-store");
    return { status: "ok" };
  } catch {
    setResponseStatus(event, 503);
    return { status: "error" };
  }
});
