import { existsSync, realpathSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const command = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const openNextCli = path.join(
  projectRoot,
  "node_modules",
  "@opennextjs",
  "cloudflare",
  "dist",
  "cli",
  "index.js",
);
const nextCli = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

if (!["build", "preview", "deploy"].includes(command)) {
  throw new Error("Cloudflare командасы build, preview немесе deploy болуы керек.");
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function normalizeWindowsPath(value) {
  return path.normalize(value).toLocaleLowerCase("en-US");
}

function workerDirectory() {
  if (process.platform !== "win32") return projectRoot;

  const junctionPath = path.join(
    os.tmpdir(),
    "payroll-dashboard-cloudflare-worker",
  );
  if (!existsSync(junctionPath)) {
    symlinkSync(projectRoot, junctionPath, "junction");
  }

  const actualTarget = normalizeWindowsPath(realpathSync(junctionPath));
  const expectedTarget = normalizeWindowsPath(realpathSync(projectRoot));
  if (actualTarget !== expectedTarget) {
    throw new Error(
      `${junctionPath} басқа папкаға бағытталған. Оны тексеріп, қайта іске қосыңыз.`,
    );
  }
  return junctionPath;
}

const workerCwd = workerDirectory();

if (command === "build") {
  if (process.platform === "win32") {
    process.env.NEXT_PRIVATE_STANDALONE = "true";
    process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = projectRoot;
    run(process.execPath, [nextCli, "build"], projectRoot);
    run(
      process.execPath,
      [openNextCli, "build", "--skipNextBuild", ...forwardedArgs],
      workerCwd,
    );
  } else {
    run(process.execPath, [openNextCli, "build", ...forwardedArgs], workerCwd);
  }
} else {
  run(process.execPath, [openNextCli, command, ...forwardedArgs], workerCwd);
}
