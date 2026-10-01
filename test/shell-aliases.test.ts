import { test, expect, describe, beforeEach } from "bun:test";
import { shellAliasStore } from "../src/shell-aliases";
import { lookupSpec } from "../src/specs";
import {
  legacyJsonToProjection,
  suggestCliAffordances,
  parseLegacyCatalogLine,
} from "../src/completion-projection";
import { projectionFromJsonString } from "../src/catalog";
import * as fs from "node:fs";
import * as path from "node:path";

describe("ShellAliasStore + lookupSpec", () => {
  beforeEach(() => {
    shellAliasStore.replaceAll({});
  });

  test("exact alias R suppresses PATH prefix matches like ResMerger", () => {
    shellAliasStore.setAlias("R", "exec zsh");
    const results = lookupSpec("R");
    expect(results.some((r) => r.cmd === "R" && r.source === "alias")).toBe(true);
    expect(results.some((r) => r.cmd === "ResMerger")).toBe(false);
  });

  test("partial Re does not match alias R (case-sensitive prefix)", () => {
    shellAliasStore.setAlias("R", "exec zsh");
    const results = lookupSpec("Re");
    expect(results.some((r) => r.cmd === "R")).toBe(false);
  });
});

describe("catalog legacy + alias spelling", () => {
  test("parseLegacyCatalogLine", () => {
    const leg = parseLegacyCatalogLine("--list-voices → voice list");
    expect(leg).toEqual({ spelling: "--list-voices", canonical: "voice list" });
  });

  test("tts snapshot includes legacy shortcuts at root", () => {
    const raw = fs.readFileSync(
      path.join(import.meta.dir, "fixtures/tts-commands.snapshot.json"),
      "utf8"
    );
    const projection = projectionFromJsonString(raw);
    const items = suggestCliAffordances("tts ", projection);
    expect(items.some((s) => s.cmd === "tts --list-voices")).toBe(true);
    expect(items.find((s) => s.cmd === "tts --list-voices")?.source).toBe("legacy");
  });

  test("verb alias keeps user family token in cmd", () => {
    const projection = legacyJsonToProjection(
      {
        version: 1,
        name: "tsh",
        topLevel: [],
        nouns: {
          entity: { verbs: ["list", "get"], aliases: { show: "get" } },
        },
      },
      "tsh"
    );
    const items = suggestCliAffordances("tsh entity ", projection);
    expect(items.some((s) => s.cmd === "tsh entity show")).toBe(true);
  });

  test("family alias token preserved in nested cmd", () => {
    const projection = legacyJsonToProjection(
      {
        version: 1,
        name: "tts",
        topLevel: [],
        nouns: {
          provider: { verbs: ["list", "set"], aliases: { providers: "list" } },
        },
      },
      "tts"
    );
    const items = suggestCliAffordances("tts providers ", projection);
    expect(items.some((s) => s.cmd === "tts providers list")).toBe(true);
  });
});
