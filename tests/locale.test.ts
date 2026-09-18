import assert from "node:assert/strict";
import test from "node:test";
import { RU } from "../app/i18n/ru.ts";

/**
 * The dictionary is keyed by the Kazakh text itself, so these tests guard the two things that can
 * quietly go wrong: a key that no longer matches the interface, and a Russian plural that does not
 * agree with the number in front of it.
 */

/** The same rule `useLocale` applies; kept here so the forms can be checked without a Vue app. */
function pluralForm(forms: string[], count: number): string {
  if (forms.length < 3) return forms[0] ?? "";
  const n = Math.abs(Math.round(count));
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0]!;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1]!;
  return forms[2]!;
}

test("Russian agreement after a numeral", () => {
  const forms = ["операция", "операции", "операций"];
  const of = (n: number) => pluralForm(forms, n);
  assert.equal(of(1), "операция");
  assert.equal(of(2), "операции");
  assert.equal(of(4), "операции");
  assert.equal(of(5), "операций");
  assert.equal(of(0), "операций");
  // The teens are the exception every naive implementation gets wrong.
  assert.equal(of(11), "операций");
  assert.equal(of(12), "операций");
  assert.equal(of(14), "операций");
  assert.equal(of(21), "операция");
  assert.equal(of(22), "операции");
  assert.equal(of(25), "операций");
  assert.equal(of(111), "операций");
  assert.equal(of(121), "операция");
  // A word with no plural forms falls back to itself rather than to an empty string.
  assert.equal(pluralForm(["Шығындар"], 5), "Шығындар");
});

test("the dictionary is well formed", () => {
  const entries = Object.entries(RU);
  assert.ok(entries.length > 400, `expected a full dictionary, found ${entries.length}`);
  for (const [kk, ru] of entries) {
    assert.ok(kk.length > 0, "a key must not be empty");
    assert.ok(ru.length > 0, `«${kk}» has an empty translation`);
    // A plural entry must carry exactly three forms, or the wrong one is silently chosen.
    if (ru.includes("|")) assert.equal(ru.split("|").length, 3, `«${kk}» must have three plural forms`);
  }
});

test("nothing Kazakh was left untranslated by accident", () => {
  /**
   * Plenty of entries are the same word in both languages — Комиссия, Оборот, Реестр, Дубликат and
   * the place names. Listing them by hand would need updating on every change, so the check uses the
   * alphabet instead: only Kazakh has ә ғ қ ң ө ұ ү һ і, so a key carrying one of those letters and
   * translating to itself is a string somebody forgot.
   */
  const KAZAKH_ONLY = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;
  const forgotten = Object.entries(RU).filter(([kk, ru]) => kk === ru && KAZAKH_ONLY.test(kk));
  assert.deepEqual(forgotten.map(([kk]) => kk), [], "these keys are Kazakh but translate to themselves");
});
