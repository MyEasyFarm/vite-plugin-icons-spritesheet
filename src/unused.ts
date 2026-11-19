export interface UnusedIconsOptions {
  typesFile: string;
  allIconNames: string[];
  cwd: string;
}

export async function findUnusedIcons(options: UnusedIconsOptions): Promise<string[]> {
  let ts: { version: string; createProgram?: unknown };
  try {
    ts = await import("typescript");
  } catch {
    console.warn("⚠️  `icons-unused` requires `typescript` to be installed — skipping detection");
    return [];
  }

  // TypeScript 7 dropped the in-process compiler API: its main entry only exports
  // the version, and the checker is reached over IPC through `typescript/sync`.
  if (typeof ts.createProgram === "function") {
    const { findUnusedIconsLegacy } = await import("./unused-legacy.ts");
    return findUnusedIconsLegacy(ts as unknown as typeof import("typescript-legacy"), options);
  }

  let native: typeof import("./unused-native.ts");
  try {
    native = await import("./unused-native.ts");
  } catch (error) {
    // TypeScript 7.0 ships the same API under `typescript/unstable/*` only
    if ((error as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    console.warn(
      `⚠️  \`icons-unused\` supports TypeScript 5–6 or 7.1+, found ${ts.version} — skipping unused icon detection`,
    );
    return [];
  }
  return native.findUnusedIconsNative(options);
}
