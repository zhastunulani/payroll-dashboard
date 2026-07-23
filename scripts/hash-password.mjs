import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.env.PAYROLL_PASSWORD;
if (!password || password.length < 10) {
  console.error(
    "PAYROLL_PASSWORD айнымалысына кемінде 10 таңбалық пароль беріңіз.",
  );
  process.exit(1);
}

const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");

console.log(
  `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`,
);
