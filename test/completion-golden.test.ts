import { test, expect, describe } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { legacyJsonToProjection, suggestCliAffordances } from "../src/completion-projection";
import { projectionFromJsonString } from "../src/catalog";
import { lookupSpec } from "../src/specs";

const fixturesDir = path.join(import.meta.dir, "fixtures");

function cmds(line: string, projection: ReturnType<typeof legacyJsonToProjection>): string[] {
  return suggestCliAffordances(line, projection)
    .map((s) => s.cmd)
    .sort();
}

const TTS_MINIMAL = {
  version: 3,
  name: "tts",
  topLevel: ["speak", "server", "conversation", "commands"],
  nouns: {
    provider: {
      verbs: ["list", "set", "show"],
      aliases: { providers: "list" },
    },
    voice: { verbs: ["list", "set", "show"], aliases: { voices: "list" } },
    persona: {
      verbs: ["list", "set", "show", "unset"],
      aliases: { personas: "list" },
    },
  },
};

const TSH_MINIMAL = {
  version: 1,
  name: "tsh",
  topLevel: ["stats"],
  nouns: {
    entity: { verbs: ["list", "get"], aliases: { show: "get" } },
  },
};

const GIT_TOP = [
  "status",
  "commit",
  "checkout",
  "switch",
  "branch",
  "push",
  "pull",
  "fetch",
  "diff",
  "log",
  "rebase",
  "stash",
  "merge",
  "clone",
  "add",
  "reset",
];

/** Token-position matrix — walker regressions (sorted cmd lists). */
const WALKER_GOLDEN: { label: string; input: string; expect: string[]; via?: "lookup" }[] = [
  {
    label: "tts root space",
    input: "tts ",
    expect: [
      "tts commands",
      "tts conversation",
      "tts persona",
      "tts personas",
      "tts provider",
      "tts providers",
      "tts server",
      "tts speak",
      "tts voice",
      "tts voices",
    ],
  },
  {
    label: "tts provider space",
    input: "tts provider ",
    expect: ["tts provider list", "tts provider set", "tts provider show"],
  },
  {
    label: "tts provider partial verb",
    input: "tts provider s",
    expect: ["tts provider set", "tts provider show"],
  },
  {
    label: "tts partial family",
    input: "tts prov",
    expect: ["tts provider", "tts providers"],
  },
  {
    label: "tsh entity space",
    input: "tsh entity ",
    expect: ["tsh entity get", "tsh entity list", "tsh entity show"],
  },
  {
    label: "tsh entity partial verb",
    input: "tsh entity g",
    expect: ["tsh entity get"],
  },
  {
    label: "git partial subcommand (registry lookupSpec)",
    input: "git st",
    expect: ["git stash", "git status"],
    via: "lookup",
  },
];

describe("completion golden table (walker)", () => {
  const ttsProjection = legacyJsonToProjection(TTS_MINIMAL, "tts");
  const tshProjection = legacyJsonToProjection(TSH_MINIMAL, "tsh");
  const gitProjection = legacyJsonToProjection(
    { version: 1, name: "git", topLevel: GIT_TOP },
    "git"
  );

  for (const row of WALKER_GOLDEN) {
    test(row.label, () => {
      if (row.via === "lookup") {
        const got = lookupSpec(row.input).map((s) => s.cmd).sort();
        expect(got).toEqual(row.expect.sort());
        return;
      }

      const projection = row.input.startsWith("tts")
        ? ttsProjection
        : row.input.startsWith("tsh")
          ? tshProjection
          : gitProjection;

      expect(cmds(row.input, projection)).toEqual(row.expect.sort());
    });
  }
});

describe("wire-format snapshots (commands --json)", () => {
  test("tts-commands.snapshot.json parses and matches golden affordances", () => {
    const raw = fs.readFileSync(path.join(fixturesDir, "tts-commands.snapshot.json"), "utf8");
    const projection = projectionFromJsonString(raw);
    expect(projection.version).toBe(3);
    expect(projection.root).toBe("tts");

    expect(cmds("tts provider ", projection)).toEqual(
      ["tts provider list", "tts provider set", "tts provider show"].sort()
    );
    expect(cmds("tts ", projection).some((c) => c === "tts speak")).toBe(true);
    expect(cmds("tts ", projection).some((c) => c === "tts provider")).toBe(true);
    expect(cmds("tts provider ", projection).some((c) => c.includes("providers"))).toBe(false);
  });

  test("tsh-catalog.snapshot.json parses and entity verbs", () => {
    const raw = fs.readFileSync(path.join(fixturesDir, "tsh-catalog.snapshot.json"), "utf8");
    const projection = projectionFromJsonString(raw);
    expect(projection.root).toBe("tsh");
    expect(cmds("tsh entity ", projection)).toEqual(
      ["tsh entity get", "tsh entity list", "tsh entity show"].sort()
    );
    expect(cmds("tsh system ", projection)).toEqual(
      ["tsh system config", "tsh system shutdown", "tsh system status"].sort()
    );
  });
});
