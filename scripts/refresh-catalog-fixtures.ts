#!/usr/bin/env bun
/**
 * Refresh test/fixtures/*-commands.snapshot.json from local turtle CLIs.
 * Run after changing tts/tsh catalog shape: bun run test:fixtures:refresh
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.join(import.meta.dir, "..");
const fixtures = path.join(root, "test", "fixtures");

const sources: { out: string; candidates: string[]; args: string[] }[] = [
  {
    out: "tts-commands.snapshot.json",
    candidates: [
      path.resolve(import.meta.dir, "../../../../OS/tts/bin/tts"),
      path.join(process.env.HOME ?? "", "TURTLE/OS/tts/bin/tts"),
      "tts",
    ],
    args: ["commands", "--json"],
  },
];

for (const { out, candidates, args } of sources) {
  let bin: string | null = null;
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      bin = c;
      break;
    } catch {
      continue;
    }
  }
  if (!bin) {
    console.warn(`skip ${out}: no binary found`);
    continue;
  }
  const res = spawnSync(bin, args, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
  const dest = path.join(fixtures, out);
  fs.mkdirSync(fixtures, { recursive: true });
  fs.writeFileSync(dest, res.stdout);
  console.log(`wrote ${dest} from ${bin}`);
}
