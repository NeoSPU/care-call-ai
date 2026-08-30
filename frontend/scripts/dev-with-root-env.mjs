import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(frontendDir, "../..");
const envFiles = [
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
  resolve(repoRoot, "frontend/.env.local"),
];

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }
  let [key, ...rest] = trimmed.split("=");
  key = key.trim().replace(/^export\s+/, "");
  if (!key) {
    return null;
  }
  let value = rest.join("=").trim();
  if (value.length >= 2 && value[0] === value[value.length - 1] && ["'", '"'].includes(value[0])) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

for (const file of envFiles) {
  if (!existsSync(file)) {
    continue;
  }
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) {
      continue;
    }
    const [key, value] = parsed;
    process.env[key] ??= value;
  }
}

const nextBin = resolve(repoRoot, "frontend/node_modules/next/dist/bin/next");
const args = ["dev", ...process.argv.slice(2)];
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: resolve(repoRoot, "frontend"),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
