import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const rootDir = process.cwd();
const apiDir = path.join(rootDir, "src", "app", "api");
const stashDir = path.join(rootDir, ".cf-api-stash");
const outDir = path.join(rootDir, "out");

function moveDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(src, { recursive: true, force: true });
}

/**
 * Mirrors `out/<route>/index.txt` to `out/<route>.txt` so that both
 * trailing-slash (`/inventory/index.txt`) and non-trailing-slash (`/inventory.txt`)
 * Next.js RSC Flight requests resolve to the current deployment's payload.
 */
function mirrorRscIndexTxtFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_next") continue;
      const indexTxtPath = path.join(fullPath, "index.txt");
      if (fs.existsSync(indexTxtPath)) {
        const siblingTxtPath = `${fullPath}.txt`;
        fs.copyFileSync(indexTxtPath, siblingTxtPath);
      }
      mirrorRscIndexTxtFiles(fullPath);
    }
  }
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

  if (exitCode === 0) {
    mirrorRscIndexTxtFiles(outDir);
  }
} finally {
  if (fs.existsSync(stashDir)) {
    moveDir(stashDir, apiDir);
  }
}

process.exit(exitCode);
