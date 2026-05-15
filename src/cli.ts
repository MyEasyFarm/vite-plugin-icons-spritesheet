#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { findUnusedIcons } from "./unused.ts";

const { values } = parseArgs({
  options: {
    "types-file": { type: "string" },
    cwd: { type: "string", default: process.cwd() },
    error: { type: "boolean", default: false },
  },
  strict: true,
});

const cwd = path.resolve(values.cwd ?? process.cwd());

async function getTypesFilesFromViteConfig(cwd: string): Promise<string[]> {
  const vite = await import("vite");
  const result: any = await vite.loadConfigFromFile({ command: "build", mode: "production" }, undefined, cwd);
  if (!result) return [];

  const plugins = (result.config.plugins ?? []).flat(Infinity);
  const typesFiles: string[] = [];

  for (const plugin of plugins) {
    if (plugin?.name?.startsWith("icon-spritesheet-generator") && plugin.__iconSpritesheetConfig?.typesFile) {
      typesFiles.push(plugin.__iconSpritesheetConfig.typesFile);
    }
  }

  return typesFiles;
}

async function checkTypesFile(typesFilePath: string): Promise<{ unused: string[]; total: number }> {
  const resolvedPath = path.resolve(cwd, typesFilePath);

  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf8");
  } catch {
    console.error(`Could not read types file: ${resolvedPath}`);
    process.exit(2);
  }

  const allIconNames: string[] = [];

  // Extract only strings between `iconNames = [` and `] as const`
  const arrayMatch = /iconNames\s*=\s*\[([^\]]*)\]/s.exec(content);
  if (arrayMatch) {
    for (const m of arrayMatch[1].matchAll(/["']([^"']+)["']/g)) {
      allIconNames.push(m[1]);
    }
  }

  if (allIconNames.length === 0) {
    console.error(`No icon names found in ${resolvedPath}. Is it a generated icons types file?`);
    process.exit(2);
  }

  const unused = await findUnusedIcons({ typesFile: resolvedPath, allIconNames, cwd });
  return { unused, total: allIconNames.length };
}

// Resolve typesFile(s)
let typesFiles: string[];

if (values["types-file"]) {
  typesFiles = [values["types-file"]];
} else {
  try {
    typesFiles = await getTypesFilesFromViteConfig(cwd);
  } catch {
    typesFiles = [];
  }
  if (typesFiles.length === 0) {
    console.error(
      "No --types-file provided and could not auto-detect from Vite config.\n" +
        "Usage: icons-unused [--types-file <path>] [--cwd <dir>] [--error]",
    );
    process.exit(2);
  }
}

const showPath = typesFiles.length > 1;
let hasUnused = false;

for (const typesFile of typesFiles) {
  const label = showPath ? ` (${typesFile})` : "";
  const { unused, total } = await checkTypesFile(typesFile);

  if (unused.length === 0) {
    console.log(styleText("green", `✅ All icons are used.${label}`));
    continue;
  }

  hasUnused = true;

  const header = styleText("yellow", `⚠️  Unused icons${label}`);
  const bulletList = unused.map((n) => `   - ${styleText("dim", n)}`).join("\n");
  const footer = styleText("dim", `${unused.length} of ${total} icons appear unused.`);
  const message = ["", `${header}:`, bulletList, `   ${footer}`, ""].join("\n");

  console.log(message);
}

process.exit(hasUnused && values.error ? 1 : 0);
