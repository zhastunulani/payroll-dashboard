import assert from "node:assert/strict";
import test from "node:test";
import { convertDaily, nbkDate, nbkRate, parseNbkRates } from "../lib/fx.ts";

/** The shape the National Bank actually serves, trimmed to three currencies. */
const XML = `<?xml version="1.0" encoding="utf-8"?>
<rates>
  <title>Official exchange rates of National Bank of Republic Kazakhstan</title>
  <date>15.08.2026</date>
  <item><fullname>АВСТРАЛИЙСКИЙ ДОЛЛАР</fullname><title>AUD</title><description>328.29</description><quant>1</quant></item>
  <item><fullname>ДОЛЛАР США</fullname><title>USD</title><description>464.02</description><quant>1</quant></item>
  <item><fullname>ЯПОНСКАЯ ЙЕНА</fullname><title>JPY</title><description>314.55</description><quant>100</quant></item>
</rates>`;

test("reads one currency out of the National Bank's XML", () => {
  assert.deepEqual(parseNbkRates(XML, "USD"), { rate: 464.02, date: "15.08.2026" });
  // A currency quoted per 100 units is brought back to one unit, so every rate means the same thing.
  assert.deepEqual(parseNbkRates(XML, "JPY"), { rate: 3.1455, date: "15.08.2026" });
  assert.equal(parseNbkRates(XML, "EUR"), null);
  assert.equal(parseNbkRates("<rates></rates>", "USD"), null);
});

test("the request uses the day format the National Bank accepts", () => {
  assert.equal(nbkDate("2026-08-15"), "15.08.2026");
  assert.equal(nbkDate("2026-01-05"), "05.01.2026");
});

test("a day with no published rate is not an error", async () => {
  const empty = async () => new Response("<rates><date>01.01.2027</date></rates>", { status: 200 });
  assert.equal(await nbkRate("2027-01-01", "USD", { fetchImpl: empty as unknown as typeof fetch }), null);

  const ok = async () => new Response(XML, { status: 200 });
  assert.deepEqual(await nbkRate("2026-08-15", "USD", { fetchImpl: ok as unknown as typeof fetch }), {
    day: "2026-08-15", currency: "USD", rate: 464.02, source: "Қазақстан Ұлттық Банкі",
  });
});

test("a failing request gives up quietly instead of throwing", async () => {
  let calls = 0;
  const failing = async () => { calls += 1; throw new Error("network down"); };
  assert.equal(await nbkRate("2026-08-15", "USD", { fetchImpl: failing as unknown as typeof fetch, deadline: Date.now() + 60_000 }), null);
  // Three attempts, then it stops: a missing rate must not fail the whole sync.
  assert.equal(calls, 3);
});

test("each day converts at its own rate, not at an average", () => {
  // Two days of equal spend at very different rates: the average rate would hide the difference.
  const rows = [{ date: "2026-01-05", amount: 100 }, { date: "2026-09-15", amount: 100 }];
  const rates: Record<string, number> = { "2026-01-05": 505.53, "2026-09-15": 447.8 };
  const result = convertDaily(rows, day => rates[day] ?? null)!;
  assert.equal(result.total, Math.round(100 * 505.53 + 100 * 447.8));
  assert.equal(result.rate, 476.67);
  assert.deepEqual(result.missing, []);
  // Using one rate for both days would be off by thousands of tenge.
  assert.notEqual(result.total, Math.round(200 * 447.8));
});

test("a missing rate leaves the total empty rather than short", () => {
  const rows = [{ date: "2026-09-15", amount: 100 }, { date: "2026-09-16", amount: 100 }];
  const partial = convertDaily(rows, day => day === "2026-09-15" ? 447.8 : null)!;
  assert.deepEqual(partial.missing, ["2026-09-16"]);
  // The caller must treat this as «unknown»: the number is not a usable total.
  assert.equal(partial.rate, null);
  assert.equal(convertDaily([], () => 450), null);
});

test("the effective rate is weighted by spend, not by day count", () => {
  // Most of the money went out on the cheap day, so the effective rate sits near it.
  const rows = [{ date: "a", amount: 900 }, { date: "b", amount: 100 }];
  const result = convertDaily(rows, day => (day === "a" ? 450 : 500))!;
  assert.equal(result.total, 900 * 450 + 100 * 500);
  assert.equal(result.rate, 455);
});
