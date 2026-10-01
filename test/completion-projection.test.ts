import { test, expect, describe } from "bun:test";
import {
  legacyJsonToProjection,
  suggestCliAffordances,
} from "../src/completion-projection";
import { lookupSpec } from "../src/specs";
import { clearProjectionCache, fetchLegacyProjection } from "../src/catalog";

const TTS_FIXTURE = {
  version: 3,
  name: "tts",
  topLevel: ["speak", "server", "conversation", "commands"],
  nouns: {
    provider: {
      verbs: ["list", "set", "show"],
      aliases: { providers: "list" },
      verbHelp: {
        list: ["List TTS backends."],
        set: ["Persist default provider."],
      },
    },
    voice: {
      verbs: ["list", "set", "show"],
    },
  },
};

const ENTITY_FIXTURE = {
  version: 1,
  name: "tsh",
  topLevel: ["stats", "query"],
  nouns: {
    entity: {
      verbs: ["list", "get"],
      aliases: { show: "get" },
    },
    issue: {
      verbs: ["list", "show"],
    },
  },
};

describe("completion projection walker", () => {
  test("tts-shaped legacy JSON → nested affordances", () => {
    const projection = legacyJsonToProjection(TTS_FIXTURE, "tts");

    const afterRoot = suggestCliAffordances("tts ", projection);
    expect(afterRoot.some((s) => s.cmd === "tts speak")).toBe(true);
    expect(afterRoot.some((s) => s.cmd === "tts provider")).toBe(true);
    expect(afterRoot.some((s) => s.cmd === "tts voice")).toBe(true);

    const providerVerbs = suggestCliAffordances("tts provider ", projection);
    expect(providerVerbs.some((s) => s.cmd === "tts provider list")).toBe(true);
    expect(providerVerbs.some((s) => s.cmd === "tts provider set")).toBe(true);
    expect(providerVerbs.find((s) => s.cmd === "tts provider list")?.desc).toContain(
      "backends"
    );

    const partial = suggestCliAffordances("tts provider s", projection);
    expect(partial.some((s) => s.cmd === "tts provider set")).toBe(true);
    expect(partial.some((s) => s.cmd === "tts provider show")).toBe(true);
  });

  test("entity list degenerate tsh-shaped fixture", () => {
    const projection = legacyJsonToProjection(ENTITY_FIXTURE, "tsh");
    const verbs = suggestCliAffordances("tsh entity ", projection);
    expect(verbs.some((s) => s.cmd === "tsh entity list")).toBe(true);
    expect(verbs.some((s) => s.cmd === "tsh entity get")).toBe(true);
    expect(verbs.some((s) => s.cmd === "tsh entity show")).toBe(true);
  });

  test("unknown root with no projection returns empty via lookupSpec", () => {
    expect(lookupSpec("notacmd ")).toEqual([]);
  });
});

describe("fetchLegacyProjection (optional live tts)", () => {
  test("loads tts commands --json when binary on PATH", () => {
    if (!process.env.BUN_TEST_REAL_TTS) return;
    clearProjectionCache();
    const projection = fetchLegacyProjection("tts");
    expect(projection).not.toBeNull();
    expect(projection!.root).toBe("tts");
    const items = suggestCliAffordances("tts provider ", projection!);
    expect(items.some((s) => s.cmd === "tts provider list")).toBe(true);
  });
});
