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

	beforeEach(async () => {
		tmpDir = await mkdtemp(path.join(tmpdir(), "icons-test-"));
		inputDir = path.join(tmpDir, "icons");
		outputDir = path.join(tmpDir, "output");
		await cp(FIXTURES_DIR, inputDir, { recursive: true });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("generates a spritesheet with symbol elements", async () => {
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
		expect(sprite).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(sprite).toContain("<defs>");
		expect(sprite).toContain("<symbol");
		expect(sprite).toContain("</defs>");
	});

	it("uses PascalCase for symbol IDs by default", async () => {
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
		expect(sprite).toContain('id="Circle"');
		expect(sprite).toContain('id="Multi"');
		expect(sprite).toContain('id="Polygon"');
	});

	it("excludes xmlns, xmlns:xlink, version, width, height from symbols but preserves viewBox", async () => {
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

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
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
		// empty.svg is <svg></svg> — parses fine, produces a symbol with id but no children
		expect(sprite).toContain('id="Empty"');
	});

	it("handles SVGs with xlink namespace", async () => {
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
		expect(sprite).toContain('id="Namespace"');
		// The use element from namespace.svg should be preserved as a child
		expect(sprite).toContain("xlink:href");
	});

	it("generates TypeScript types when withTypes is true", async () => {
		await generateIcons({ inputDir, outputDir, withTypes: true, cwd: tmpDir });

		const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
		expect(types).toContain("export const iconNames");
		expect(types).toContain("export type IconName");
		expect(types).toContain('"Circle"');
		expect(types).toContain('"Multi"');
		expect(types).toContain('"Polygon"');
	});

	it("generates types at a custom typesOutputFile path", async () => {
		const typesOutputFile = path.join(tmpDir, "custom", "icons.ts");
		await generateIcons({ inputDir, outputDir, withTypes: true, typesOutputFile, cwd: tmpDir });

		const types = await readFile(typesOutputFile, "utf8");
		expect(types).toContain("export const iconNames");
	});

	it("uses custom fileName for spritesheet", async () => {
		await generateIcons({ inputDir, outputDir, fileName: "icons.svg", cwd: tmpDir });

		const sprite = await readFile(path.join(outputDir, "icons.svg"), "utf8");
		expect(sprite).toContain("<symbol");
	});

	it("respects custom iconNameTransformer", async () => {
		await generateIcons({
			inputDir,
			outputDir,
			iconNameTransformer: (name) => `icon-${name}`,
			cwd: tmpDir,
		});

		const sprite = await readFile(path.join(outputDir, "sprite.svg"), "utf8");
		expect(sprite).toContain('id="icon-circle"');
		expect(sprite).toContain('id="icon-multi"');
	});

	it("formats generated types with Biome when available", async () => {
		// Use project cwd so findFormatter can locate the Biome binary
		await generateIcons({ inputDir, outputDir, withTypes: true, cwd: process.cwd() });

		const types = await readFile(path.join(outputDir, "types.ts"), "utf8");
		// Biome adds semicolons and wraps typeof in parens
		expect(types).toContain("as const;");
		expect(types).toContain("IconName = (typeof iconNames)[number];");
	});

	it("produces no output when input directory has no SVG files", async () => {
		const emptyInput = path.join(tmpDir, "empty-input");
		await mkdir(emptyInput, { recursive: true });

		await generateIcons({ inputDir: emptyInput, outputDir, cwd: tmpDir });

		await expect(readFile(path.join(outputDir, "sprite.svg"), "utf8")).rejects.toThrow();
	});

	it("does not write file again when content has not changed", async () => {
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const spritePath = path.join(outputDir, "sprite.svg");
		const sprite1 = await readFile(spritePath, "utf8");
		const { mtimeMs } = await import("node:fs").then((m) => m.promises.stat(spritePath));

		// HFS+ has 1-second mtime resolution, so wait long enough to detect a rewrite
		await new Promise((r) => setTimeout(r, 1100));
		await generateIcons({ inputDir, outputDir, cwd: tmpDir });

		const sprite2 = await readFile(spritePath, "utf8");
		const { mtimeMs: mtimeMs2 } = await import("node:fs").then((m) => m.promises.stat(spritePath));

		expect(sprite1).toBe(sprite2);
		expect(mtimeMs2).toBe(mtimeMs);
	});
});

describe("iconsSpritesheet", () => {
	it("returns an array of plugins for a single config", () => {
		const plugins = iconsSpritesheet({ inputDir: "icons", outputDir: "output" });
		expect(Array.isArray(plugins)).toBe(true);
		expect(plugins).toHaveLength(1);
		expect(plugins[0].name).toBe("icon-spritesheet-generator");
	});

	it("returns an array of plugins for multiple configs", () => {
		const plugins = iconsSpritesheet([
			{ inputDir: "icons1", outputDir: "output1" },
			{ inputDir: "icons2", outputDir: "output2" },
		]);
		expect(plugins).toHaveLength(2);
		expect(plugins[0].name).toBe("icon-spritesheet-generator");
		expect(plugins[1].name).toBe("icon-spritesheet-generator1");
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
