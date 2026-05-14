import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileNameToCamelCase, generateIcons, iconsSpritesheet } from "../src/index.ts";

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
    await rm(tmpDir, { recursive: true, force: true });
  });

  const genSprite = async (): Promise<string> => {
    await generateIcons({ inputDir, outputFile, cwd: tmpDir });
    return readFile(path.join(outputDir, "sprite.svg"), "utf8");
  };

  it("generates a spritesheet with symbol elements", async () => {
    const sprite = await genSprite();
    assert.ok(sprite.includes('<?xml version="1.0" encoding="UTF-8"?>'), "missing XML declaration");
    assert.ok(sprite.includes("<defs>"), "missing <defs>");
    assert.ok(sprite.includes("<symbol"), "missing <symbol>");
    assert.ok(sprite.includes("</defs>"), "missing </defs>");
  });

  it("uses PascalCase for symbol IDs by default", async () => {
    const sprite = await genSprite();
    assert.ok(sprite.includes('id="Circle"'), 'missing id="Circle"');
    assert.ok(sprite.includes('id="Multi"'), 'missing id="Multi"');
    assert.ok(sprite.includes('id="Polygon"'), 'missing id="Polygon"');
  });

  it("excludes xmlns, xmlns:xlink, version, width, height from symbols but preserves viewBox", async () => {
    const sprite = await genSprite();

    // The root <svg> has width/height, but symbols should not
    const symbols = sprite.split("<symbol");
    for (const sym of symbols.slice(1)) {
      const attrs = sym.slice(0, sym.indexOf(">"));
      assert.ok(!attrs.includes("xmlns"), "symbol should not contain xmlns");
      assert.ok(!attrs.includes("version"), "symbol should not contain version");
      // width/height should be excluded from symbols
      assert.doesNotMatch(attrs, /\bwidth\b/);
      assert.doesNotMatch(attrs, /\bheight\b/);
    }

    // circle.svg has viewBox — it should be preserved on its symbol
    const circleSymbol = sprite.match(/<symbol[^>]*id="Circle"[^>]*>/)?.[0];
    assert.ok(circleSymbol?.includes('viewBox="0 0 100 100"'), "Circle symbol missing viewBox");
  });

  it("produces a symbol for empty SVG (no children, no attributes)", async () => {
    const sprite = await genSprite();
    // empty.svg is <svg></svg> — parses fine, produces a symbol with id but no children
    assert.ok(sprite.includes('id="Empty"'), 'missing id="Empty"');
  });

  it("handles SVGs with xlink namespace", async () => {
    const sprite = await genSprite();
    assert.ok(sprite.includes('id="Namespace"'), 'missing id="Namespace"');
    // The use element from namespace.svg should be preserved as a child
    assert.ok(sprite.includes("xlink:href"), "missing xlink:href");
  });

  it("generates TypeScript types when typesFile is set", async () => {
    await generateIcons({ inputDir, outputFile, typesFile: path.join(outputDir, "types.ts"), cwd: tmpDir });

    const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
    assert.ok(types.includes("export const iconNames"), "missing iconNames export");
    assert.ok(types.includes("export type IconName"), "missing IconName type");
    assert.ok(types.includes('"Circle"'), 'missing "Circle"');
    assert.ok(types.includes('"Multi"'), 'missing "Multi"');
    assert.ok(types.includes('"Polygon"'), 'missing "Polygon"');
  });

  it("generates types at a custom typesFile path", async () => {
    const typesFile = path.join(tmpDir, "custom", "icons.ts");
    await generateIcons({ inputDir, outputFile, typesFile, cwd: tmpDir });

    const types = await readFile(typesFile, "utf8");
    assert.ok(types.includes("export const iconNames"), "missing iconNames export");
  });

  it("uses custom outputFile path for spritesheet", async () => {
    await generateIcons({ inputDir, outputFile: path.join(outputDir, "icons.svg"), cwd: tmpDir });

    const sprite = await readFile(path.join(outputDir, "icons.svg"), "utf8");
    assert.ok(sprite.includes("<symbol"), "missing <symbol>");
  });

  it("respects custom iconNameTransformer", async () => {
    await generateIcons({
      inputDir,
      outputFile,
      iconNameTransformer: (name) => `icon-${name}`,
      cwd: tmpDir,
    });

    const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
    assert.ok(sprite.includes('id="icon-circle"'), 'missing id="icon-circle"');
    assert.ok(sprite.includes('id="icon-multi"'), 'missing id="icon-multi"');
  });

  it("formats generated types with Biome when available", async () => {
    // Use project cwd so findFormatter can locate the Biome binary
    await generateIcons({ inputDir, outputFile, typesFile: path.join(outputDir, "types.ts"), cwd: process.cwd() });

    const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
    // Biome adds semicolons and wraps typeof in parens
    assert.ok(types.includes("as const;"), "missing semicolon after as const");
    assert.ok(types.includes("IconName = (typeof iconNames)[number];"), "missing formatted IconName type");
  });

  it("returns an array of icon names", async () => {
    const names = await generateIcons({ inputDir, outputFile, cwd: tmpDir });
    assert.ok(names.includes("Circle"), 'missing "Circle" in names');
    assert.ok(names.includes("Multi"), 'missing "Multi" in names');
    assert.ok(names.includes("Polygon"), 'missing "Polygon" in names');
    assert.strictEqual(names.length, 7);
  });

  it("produces no output when input directory has no SVG files", async () => {
    const emptyInput = path.join(tmpDir, "empty-input");
    await mkdir(emptyInput, { recursive: true });

    const names = await generateIcons({ inputDir: emptyInput, outputFile, cwd: tmpDir });

    assert.deepStrictEqual(names, []);
    await assert.rejects(readFile(path.join(outputDir, "sprite.svg"), "utf8"));
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

    assert.strictEqual(sprite1, sprite2);
    assert.strictEqual(mtimeMs2, mtimeMs);
  });
});

describe("iconsSpritesheet", () => {
  it("returns an array of plugins for a single config", () => {
    const plugins = iconsSpritesheet({ inputDir: "icons", outputFile: "output/sprite.svg" });
    assert.ok(Array.isArray(plugins), "should return an array");
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, "icon-spritesheet-generator");
  });

  it("returns an array of plugins for multiple configs", () => {
    const plugins = iconsSpritesheet([
      { inputDir: "icons1", outputFile: "output1/sprite.svg" },
      { inputDir: "icons2", outputFile: "output2/sprite.svg" },
    ]);
    assert.strictEqual(plugins.length, 2);
    assert.strictEqual(plugins[0].name, "icon-spritesheet-generator");
    assert.strictEqual(plugins[1].name, "icon-spritesheet-generator1");
  });
});

describe("fileNameToCamelCase", () => {
  it("converts hyphenated names to PascalCase", () => {
    assert.strictEqual(fileNameToCamelCase("my-icon"), "MyIcon");
    assert.strictEqual(fileNameToCamelCase("arrow-left"), "ArrowLeft");
  });

  it("capitalizes single word names", () => {
    assert.strictEqual(fileNameToCamelCase("circle"), "Circle");
  });
});
