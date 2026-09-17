import { isRequestAuthenticated } from "../../lib/auth";
import { backfillFxRates, saveMetaAccount, saveMetaRate, saveMetaToken, saveRegionRule, syncMeta } from "../../lib/meta-database";
import { webRequest } from "../utils/legacy-response";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default defineEventHandler(async event => {
  const request = await webRequest(event);
  if (!await isRequestAuthenticated(request)) throw createError({ statusCode: 401, statusMessage: "Сессия аяқталды." });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) throw createError({ statusCode: 403, statusMessage: "Origin mismatch" });
  const body = await request.json();
  try {
    switch (body.action) {
      case "sync": {
        const from = String(body.from ?? "");
        const to = String(body.to ?? "");
        if (!DATE.test(from) || !DATE.test(to)) throw new Error("Кезең YYYY-MM-DD форматында болуы керек.");
        if (from > to) throw new Error("Басы соңынан кейін тұр.");
        return await syncMeta({ from, to, regions: body.regions === true, accountIds: Array.isArray(body.accountIds) ? body.accountIds.map(String) : undefined });
      }
      case "account":
        await saveMetaAccount(
          String(body.id), body.projectId ? String(body.projectId) : null, body.tracked !== false,
          String(body.note ?? ""), body.splitMode === "region" ? "region" : body.projectId ? "project" : "none",
        );
        return { ok: true };
      case "region":
        await saveRegionRule(String(body.region), body.projectId ? String(body.projectId) : null, body.reset === true);
        return { ok: true };
      // Rates come from the National Bank, so they can be filled in without the Meta token.
      case "rates": return { ok: true, ...await backfillFxRates() };
      /**
       * The token is saved in the database, encrypted, because production takes its environment from
       * a systemd file that only SSH can change. It is never read back out to the browser.
       */
      case "token": return { ok: true, stored: await saveMetaToken(String(body.token ?? "")) };
      case "rate": {
        const rate = body.rate === null || body.rate === "" ? null : Number(body.rate);
        if (rate !== null && !(rate > 0)) throw new Error("Бағам нөлден үлкен болуы керек.");
        await saveMetaRate(String(body.period), rate, String(body.source ?? "Қолмен енгізілген"));
        return { ok: true };
      }
      default: throw new Error("Әрекет дұрыс емес.");
    }
  } catch (error) {
    throw createError({ statusCode: 400, message: error instanceof Error ? error.message : "Сақтау орындалмады." });
  }
});
