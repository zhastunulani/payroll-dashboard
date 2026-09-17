import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret, isEncrypted } from "../lib/secrets.ts";

const SECRET = "a-test-session-secret-at-least-32-characters-long";
const withSecret = <T>(value: string, run: () => T): T => {
  const before = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = before;
  }
};

test("a secret survives the round trip", () => {
  withSecret(SECRET, () => {
    const token = "EAAOMlbYMyQcB-example-token-value";
    const stored = encryptSecret(token);
    assert.equal(decryptSecret(stored), token);
    assert.ok(isEncrypted(stored));
    // The stored form must not contain the value: a copy of the database alone reveals nothing.
    assert.ok(!stored.includes(token));
    assert.ok(!stored.includes(token.slice(0, 12)));
  });
});

test("every encryption uses a fresh nonce", () => {
  withSecret(SECRET, () => {
    const a = encryptSecret("same input");
    const b = encryptSecret("same input");
    // Identical input must not produce identical ciphertext, or repeats would be visible.
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), "same input");
    assert.equal(decryptSecret(b), "same input");
  });
});

test("a value from another secret, or a tampered one, reads as absent rather than throwing", () => {
  const stored = withSecret(SECRET, () => encryptSecret("token"));
  // A different SESSION_SECRET cannot read it, and the caller sees «no token» instead of a crash.
  assert.equal(withSecret("a-completely-different-session-secret-value", () => decryptSecret(stored)), null);
  // A changed byte fails the authentication tag.
  const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(withSecret(SECRET, () => decryptSecret(tampered)), null);
  // Anything that is not in this format is not a secret.
  assert.equal(withSecret(SECRET, () => decryptSecret("plain-old-token")), null);
  assert.equal(withSecret(SECRET, () => decryptSecret("enc.v1.broken")), null);
  assert.equal(isEncrypted("plain-old-token"), false);
});

test("encrypting without a session secret is refused, not done weakly", () => {
  assert.throws(() => withSecret("", () => encryptSecret("x")), /SESSION_SECRET/);
  assert.throws(() => withSecret("short", () => encryptSecret("x")), /SESSION_SECRET/);
});
