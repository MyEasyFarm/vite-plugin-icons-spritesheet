import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileNameToCamelCase, generateIcons, iconsSpritesheet } from "../src/index.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures/icons");

describe("generateIcons", () => {
  let tmpDir: string;
  let inputDir: string;
  let outputDir: string;
  let outputFile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "icons-test-"));
    inputDir = path.join(tmpDir, "icons");
    outputDir = path.join(tmpDir, "output");
    outputFile = path.join(outputDir, "sprite.svg");
    await cp(FIXTURES_DIR, inputDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates a spritesheet with symbol elements", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    expect(sprite).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sprite).toContain("<defs>");
    expect(sprite).toContain("<symbol");
    expect(sprite).toContain("</defs>");
  });

  it("uses PascalCase for symbol IDs by default", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    expect(sprite).toContain('id="Circle"');
    expect(sprite).toContain('id="Multi"');
    expect(sprite).toContain('id="Polygon"');
  });

  it("excludes xmlns, xmlns:xlink, version, width, height from symbols but preserves viewBox", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");

    // The root <svg> has width/height, but symbols should not
    const symbols = sprite.split("<symbol");
    for (const sym of symbols.slice(1)) {
      const attrs = sym.slice(0, sym.indexOf(">"));
      expect(attrs).not.toContain("xmlns");
      expect(attrs).not.toContain("version");
      // width/height should be excluded from symbols
      expect(attrs).not.toMatch(/\bwidth\b/);
      expect(attrs).not.toMatch(/\bheight\b/);
    }

    // circle.svg has viewBox — it should be preserved on its symbol
    const circleSymbol = sprite.match(/<symbol[^>]*id="Circle"[^>]*>/)?.[0];
    expect(circleSymbol).toContain('viewBox="0 0 100 100"');
  });

  it("produces a symbol for empty SVG (no children, no attributes)", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    // empty.svg is <svg></svg> — parses fine, produces a symbol with id but no children
    expect(sprite).toContain('id="Empty"');
  });

  it("handles SVGs with xlink namespace", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    expect(sprite).toContain('id="Namespace"');
    // The use element from namespace.svg should be preserved as a child
    expect(sprite).toContain("xlink:href");
  });

  it("generates TypeScript types when typesFile is set", async () => {
    await generateIcons({ inputDir, outputFile, typesFile: path.join(outputDir, "types.ts"), cwd: tmpDir });

    const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
    expect(types).toContain("export const iconNames");
    expect(types).toContain("export type IconName");
    expect(types).toContain('"Circle"');
    expect(types).toContain('"Multi"');
    expect(types).toContain('"Polygon"');
  });

  it("generates types at a custom typesFile path", async () => {
    const typesFile = path.join(tmpDir, "custom", "icons.ts");
    await generateIcons({ inputDir, outputFile, typesFile, cwd: tmpDir });

    const types = await readFile(typesFile, "utf8");
    expect(types).toContain("export const iconNames");
  });

  it("uses custom outputFile path for spritesheet", async () => {
    await generateIcons({ inputDir, outputFile: path.join(outputDir, "icons.svg"), cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "icons.svg"), "utf8");
    expect(sprite).toContain("<symbol");
  });

  it("respects custom iconNameTransformer", async () => {
    await generateIcons({
      inputDir,
      outputFile,
      iconNameTransformer: (name) => `icon-${name}`,
      cwd: tmpDir,
    });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    expect(sprite).toContain('id="icon-circle"');
    expect(sprite).toContain('id="icon-multi"');
  });

  it("formats generated types with Biome when available", async () => {
    // Use project cwd so findFormatter can locate the Biome binary
    await generateIcons({ inputDir, outputFile, typesFile: path.join(outputDir, "types.ts"), cwd: process.cwd() });

    const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
    // Biome adds semicolons and wraps typeof in parens
    expect(types).toContain("as const;");
    expect(types).toContain("IconName = (typeof iconNames)[number];");
  });

  it("returns an array of icon names", async () => {
    const names = await generateIcons({ inputDir, outputFile, cwd: tmpDir });
    expect(names).toContain("Circle");
    expect(names).toContain("Multi");
    expect(names).toContain("Polygon");
    expect(names).toHaveLength(7);
  });

  it("produces no output when input directory has no SVG files", async () => {
    const emptyInput = path.join(tmpDir, "empty-input");
    await mkdir(emptyInput, { recursive: true });

    const names = await generateIcons({ inputDir: emptyInput, outputFile, cwd: tmpDir });

    expect(names).toEqual([]);
    await expect(readFile(path.join(outputDir, "sprite.svg"), "utf8")).rejects.toThrow();
  });

  it("does not write file again when content has not changed", async () => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const spritePath = path.join(outputDir, "sprite.svg");
    const sprite1 = await readFile(spritePath, "utf8");
    const { mtimeMs } = await import("node:fs").then((m) => m.promises.stat(spritePath));

    // HFS+ has 1-second mtime resolution, so wait long enough to detect a rewrite
    await new Promise((r) => setTimeout(r, 1100));
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });

    const sprite2 = await readFile(spritePath, "utf8");
    const { mtimeMs: mtimeMs2 } = await import("node:fs").then((m) => m.promises.stat(spritePath));

    expect(sprite1).toBe(sprite2);
    expect(mtimeMs2).toBe(mtimeMs);
  });
});

describe("iconsSpritesheet", () => {
  it("returns an array of plugins for a single config", () => {
    const plugins = iconsSpritesheet({ inputDir: "icons", outputFile: "output/sprite.svg" });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("icon-spritesheet-generator");
  });

  it("returns an array of plugins for multiple configs", () => {
    const plugins = iconsSpritesheet([
      { inputDir: "icons1", outputFile: "output1/sprite.svg" },
      { inputDir: "icons2", outputFile: "output2/sprite.svg" },
    ]);
    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe("icon-spritesheet-generator");
    expect(plugins[1].name).toBe("icon-spritesheet-generator1");
  });
});

describe("unused icon detection", () => {
  let tmpDir: string;
  let inputDir: string;
  let outputDir: string;
  let outputFile: string;
  let typesFile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "icons-unused-test-"));
    inputDir = path.join(tmpDir, "icons");
    outputDir = path.join(tmpDir, "output");
    outputFile = path.join(outputDir, "sprite.svg");
    typesFile = path.join(outputDir, "icons.ts");
    await cp(FIXTURES_DIR, inputDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reports unused icons during build", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    // Only "Circle" is used
    plugin.transform(`const icon = "Circle";`, "/app/component.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Unused icons");
    expect(output).not.toContain("- Circle");
    expect(output).toContain("Multi");
  });

  it("does not warn when unused is not set", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});
    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });

  it("marks all icons used when iconNames array is imported", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(`import { iconNames } from "./output/icons";\nconst all = iconNames;`, "/app/all-icons.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });

  it("does not run detection in serve mode", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "serve" });
    await plugin.buildStart({});
    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });

  it("skips node_modules and svg files in transform", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    // These should be skipped even though they contain icon names
    plugin.transform(`const x = "Circle"`, "/node_modules/lib/index.js");
    plugin.transform(`<svg id="Circle"/>`, "/icons/circle.svg");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Unused icons");
    expect(output).toContain("Circle");
  });

  it("detects iconNames import with .js extension", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(`import { iconNames } from "./output/icons.js";\nconst all = iconNames;`, "/app/all-icons.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });

  it("works when typesFile is not set", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(`const icon = "Circle";`, "/app/component.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Unused icons");
    expect(output).not.toContain("- Circle");
  });

  it("shows dynamic usage qualifier when no literals found in types importer", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(
      `import type { IconName } from "./output/icons";\nfunction getIcon(name: IconName) {}`,
      "/app/dynamic.tsx",
    );

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("dynamic usage detected");
  });

  it("does not mark all used from commented-out iconNames import", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(`// import { iconNames } from "./output/icons";\nconst x = "Circle";`, "/app/commented.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Unused icons");
    // Circle is used as a literal, but the rest should be unused
    expect(output).not.toContain("- Circle");
    expect(output).toContain("Multi");
  });

  it("marks all used when iconNames is re-exported", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    plugin.transform(`export { iconNames } from "./output/icons";`, "/app/reexport.tsx");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });

  it("strips query strings from module IDs", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    // Should still detect "Circle" despite query string on module ID
    plugin.transform(`const icon = "Circle";`, "/app/component.tsx?v=abc");

    await plugin.buildEnd();

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Unused icons");
    expect(output).not.toContain("- Circle");
  });

  it("fails the build when unused is 'error'", async () => {
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "error",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});

    // Only "Circle" is used — the rest are unused
    plugin.transform(`const icon = "Circle";`, "/app/component.tsx");

    const mockError = vi.fn();
    expect(() => plugin.buildEnd.call({ error: mockError })).not.toThrow();
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0][0]).toContain("Unused icons");
  });

  it("does not report when build has error", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const plugins = iconsSpritesheet({
      inputDir,
      outputFile,
      typesFile,
      cwd: tmpDir,
      unused: "warn",
    });
    const plugin = plugins[0];

    await plugin.configResolved({ command: "build" });
    await plugin.buildStart({});
    await plugin.buildEnd(new Error("build failed"));

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("Unused icons");
  });
});

describe("fileNameToCamelCase", () => {
  it("converts hyphenated names to PascalCase", () => {
    expect(fileNameToCamelCase("my-icon")).toBe("MyIcon");
    expect(fileNameToCamelCase("arrow-left")).toBe("ArrowLeft");
  });

  it("capitalizes single word names", () => {
    expect(fileNameToCamelCase("circle")).toBe("Circle");
  });
});
