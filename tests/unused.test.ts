import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { findUnusedIcons } from "../src/unused.ts";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures/unused");
const ALL_ICON_NAMES = ["Circle", "Square", "Triangle", "FlagEn", "FlagFr", "Unused"];

describe("findUnusedIcons", () => {
  let tmpDir: string;
  let typesFile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "unused-test-"));
    await cp(FIXTURES_DIR, tmpDir, { recursive: true });
    typesFile = path.join(tmpDir, "icon-types.ts");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("contextual: 'Circle' assigned to IconName-typed variable is detected as used", async () => {
    const unused = await findUnusedIcons({ typesFile, allIconNames: ALL_ICON_NAMES, cwd: tmpDir });
    assert.ok(!unused.includes("Circle"), `expected "Circle" to be used, got unused=${JSON.stringify(unused)}`);
    assert.ok(unused.includes("Unused"), `expected "Unused" in result, got ${JSON.stringify(unused)}`);
  });

  it("binary: 'Square' in `icon === \"Square\"` comparison is detected as used", async () => {
    const unused = await findUnusedIcons({ typesFile, allIconNames: ALL_ICON_NAMES, cwd: tmpDir });
    assert.ok(!unused.includes("Square"), `expected "Square" to be used, got unused=${JSON.stringify(unused)}`);
    assert.ok(unused.includes("Unused"), `expected "Unused" in result, got ${JSON.stringify(unused)}`);
  });

  it("case: 'Triangle' in switch/case clause is detected as used", async () => {
    const unused = await findUnusedIcons({ typesFile, allIconNames: ALL_ICON_NAMES, cwd: tmpDir });
    assert.ok(!unused.includes("Triangle"), `expected "Triangle" to be used, got unused=${JSON.stringify(unused)}`);
    assert.ok(unused.includes("Unused"), `expected "Unused" in result, got ${JSON.stringify(unused)}`);
  });

  it("template: 'FlagEn' and 'FlagFr' from a Flag-prefixed template literal type are detected as used", async () => {
    const unused = await findUnusedIcons({ typesFile, allIconNames: ALL_ICON_NAMES, cwd: tmpDir });
    assert.ok(!unused.includes("FlagEn"), `expected "FlagEn" to be used, got unused=${JSON.stringify(unused)}`);
    assert.ok(!unused.includes("FlagFr"), `expected "FlagFr" to be used, got unused=${JSON.stringify(unused)}`);
    assert.ok(unused.includes("Unused"), `expected "Unused" in result, got ${JSON.stringify(unused)}`);
  });
});
