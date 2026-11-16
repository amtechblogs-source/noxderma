import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "src", "app", "api");
const stashDir = path.join(rootDir, ".cf-api-stash");

function moveDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(src, { recursive: true, force: true });
}

let exitCode = 0;

try {
  // Temporarily stash Node API routes during static export (Cloudflare Pages serves functions/api/* instead)
  if (fs.existsSync(apiDir)) {
    moveDir(apiDir, stashDir);
  }

  const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
  const res = spawnSync(process.execPath, [nextBin, "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      STATIC_EXPORT: "1",
    },
  });

  exitCode = res.status ?? 1;
} finally {
  if (fs.existsSync(stashDir)) {
    moveDir(stashDir, apiDir);
  }
}

process.exit(exitCode);
