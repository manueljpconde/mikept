import { readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "dist", "out", "build"]);

function walk(dir, found = []) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return found;
    }
    for (const entry of entries) {
        if (SKIP.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, found);
        else if (entry.endsWith(".test.ts")) found.push(full);
    }
    return found;
}

const files = [
    ...walk(join(ROOT, "src")),
    ...walk(join(ROOT, "scripts")),
];

if (files.length === 0) {
    console.error("No test files found.");
    process.exit(1);
}

const child = spawn(
    "npx",
    ["tsx", "--test", ...files],
    { stdio: "inherit", cwd: ROOT },
);

child.on("exit", (code) => process.exit(code ?? 1));
