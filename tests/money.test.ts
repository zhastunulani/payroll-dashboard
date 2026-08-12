import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "../lib/money.ts";

test("money is rendered as grouped whole tenge", () => {
  assert.equal(formatMoney(10), "10 ₸");
  assert.equal(formatMoney(100), "100 ₸");
  assert.equal(formatMoney(1_000), "1 000 ₸");
  assert.equal(formatMoney(200_000), "200 000 ₸");
  assert.equal(formatMoney(2_000_000), "2 000 000 ₸");
  assert.equal(formatMoney(15_000_000), "15 000 000 ₸");
  assert.doesNotMatch(formatMoney(18_289_513), /,/);
});

test("zero is empty in an editable money field", () => {
  assert.equal(formatMoneyInput(0), "");
  assert.equal(parseMoneyInput(""), 0);
});

test("formatted and pasted money values are parsed without leading zeroes", () => {
  assert.equal(parseMoneyInput("05 000"), 5_000);
  assert.equal(parseMoneyInput("1 200 ₸"), 1_200);
  assert.equal(formatMoneyInput(5_000), "5 000");
});
