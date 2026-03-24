#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { findUnusedIcons } from "./unused.ts";

const { values } = parseArgs({
  options: {
    typesFile: { type: "string" },
    cwd: { type: "string", default: process.cwd() },
    error: { type: "boolean", default: false },
  },
  strict: true,
});

if (!values.typesFile) {
  console.error("Usage: icons-unused --typesFile <path> [--cwd <dir>] [--error]");
  process.exit(2);
}

const cwd = path.resolve(values.cwd ?? process.cwd());
const typesFile = path.resolve(cwd, values.typesFile);

// Parse icon names from the generated types file
let content: string;
try {
  content = readFileSync(typesFile, "utf8");
} catch {
  console.error(`Could not read types file: ${typesFile}`);
  process.exit(2);
}

const allIconNames: string[] = [];
for (const match of content.matchAll(/"([^"]+)"/g)) {
  // Only capture strings inside the iconNames array block
  if (content.indexOf("iconNames") === -1) break;
  allIconNames.push(match[1]);
}

// More precise: extract only strings between `iconNames = [` and `] as const`
const arrayMatch = content.match(/iconNames\s*=\s*\[([^\]]*)\]/s);
if (arrayMatch) {
  allIconNames.length = 0;
  for (const m of arrayMatch[1].matchAll(/"([^"]+)"/g)) {
    allIconNames.push(m[1]);
  }
}

if (allIconNames.length === 0) {
  console.error("No icon names found in types file. Is it a generated icons types file?");
  process.exit(2);
}

const unusedIcons = await findUnusedIcons({ typesFile, allIconNames, cwd });

if (unusedIcons.length === 0) {
  console.log(styleText("green", "✅ All icons are used."));
  process.exit(0);
}

const message =
  `\n${styleText("yellow", "⚠️  Unused icons")}:\n` +
  `${unusedIcons.map((n) => `   - ${styleText("dim", n)}`).join("\n")}\n` +
  `   ${styleText("dim", `${unusedIcons.length} of ${allIconNames.length} icons appear unused.`)}\n`;

console.log(message);
process.exit(values.error ? 1 : 0);
