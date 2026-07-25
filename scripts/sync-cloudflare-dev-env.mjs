import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, ".env.local");
const targetPath = path.join(projectRoot, ".dev.vars");
const requiredKeys = ["DATABASE_URL", "APP_PASSWORD_HASH", "SESSION_SECRET"];

if (!existsSync(sourcePath)) {
  throw new Error(".env.local табылмады.");
}

const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
const targetLines = existsSync(targetPath)
  ? readFileSync(targetPath, "utf8").split(/\r?\n/)
  : [];

function lineKey(line) {
  return line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
}

const sourceByKey = new Map(
  sourceLines
    .map((line) => [lineKey(line), line])
    .filter(([key]) => key),
);

for (const key of requiredKeys) {
  if (!sourceByKey.has(key)) {
    throw new Error(`${key} .env.local ішінде табылмады.`);
  }
}

const retainedLines = targetLines.filter(
  (line) => !requiredKeys.includes(lineKey(line)),
);

while (retainedLines.at(-1) === "") {
  retainedLines.pop();
}

const merged = [
  ...retainedLines,
  ...(retainedLines.length ? [""] : []),
  ...requiredKeys.map((key) => sourceByKey.get(key)),
  "",
].join("\n");

writeFileSync(targetPath, merged, "utf8");
console.log("Cloudflare preview құпиялары .env.local файлынан синхрондалды.");
