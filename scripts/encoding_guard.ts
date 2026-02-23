import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const TARGET_DIRS = ["client", "server", "shared", "docs", "scripts", "api"];
const TARGET_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

type Issue = {
  file: string;
  reason: string;
};

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (TARGET_EXTS.has(ext)) out.push(full);
  }
}

function hasUtf16Bom(buf: Buffer): boolean {
  if (buf.length < 2) return false;
  return (
    (buf[0] === 0xff && buf[1] === 0xfe) ||
    (buf[0] === 0xfe && buf[1] === 0xff)
  );
}

function main() {
  const files: string[] = [];
  TARGET_DIRS.forEach((dir) => walk(path.join(ROOT, dir), files));

  const issues: Issue[] = [];
  for (const file of files) {
    const buf = fs.readFileSync(file);

    if (hasUtf16Bom(buf)) {
      issues.push({
        file: path.relative(ROOT, file),
        reason: "UTF-16 BOM detected (must be UTF-8).",
      });
      continue;
    }

    const text = buf.toString("utf8");
    if (text.includes("\uFFFD")) {
      issues.push({
        file: path.relative(ROOT, file),
        reason: "Replacement character (U+FFFD) detected; possible encoding corruption.",
      });
    }
  }

  if (issues.length > 0) {
    console.error("[encoding_guard] FAILED");
    issues.forEach((issue) => {
      console.error(`- ${issue.file}: ${issue.reason}`);
    });
    process.exit(1);
  }

  console.log(`[encoding_guard] OK (${files.length} files scanned)`);
}

main();
