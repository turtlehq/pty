import { test, expect, describe } from "bun:test";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createPTY } from "../src/pty";
import { stripAnsi } from "../src/overlay";

const projectRoot = path.join(import.meta.dir, "..");
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip CSI + OSC (e.g. starship 133) so prompt-line assertions are stable. */
function normalizeTerminalText(raw: string): string {
  return stripAnsi(raw)
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[\?[0-9;]*[hl]/g, "");
}

async function waitFor(
  pred: () => boolean,
  timeoutMs = 8000,
  stepMs = 40
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await delay(stepMs);
  }
  throw new Error("waitFor timed out");
}

/**
 * Menu rows are reserved with IND (ESC D), which scrolls while preserving the
 * cursor column. A "\n" would be rewritten to CR+LF by the tty's OPOST/ONLCR and
 * drop the saved prompt anchor to column 0 — the "cursor jumps to the left" desync.
 *
 * The exact prompt-line behaviour is covered deterministically in
 * test/iris.test.ts ("render reserves menu rows without resetting the prompt
 * column"); this PTY test guards that the live session keeps the input attached
 * to the prompt and reserves rows with IND instead of LF.
 */
function reservedRowsWithInd(plain: string): boolean {
  return plain.includes("\x1bD");
}

/** Input-only row with no shell prompt marker — the space-key corruption signature. */
function hasOrphanInputLine(plain: string): boolean {
  for (const line of plain.split("\n")) {
    const t = line.trim();
    if ((t === "ts" || t === "tt") && !line.includes("❯") && !line.includes("▶")) {
      return true;
    }
  }
  return false;
}

async function runIrisSession(
  keystrokes: (ctx: {
    write: (s: string) => void;
    plain: () => string;
  }) => Promise<void>
): Promise<string> {
  const pty = createPTY(32, 120);
  let raw = "";

  const child = spawn("bun", ["run", "src/index.ts"], {
    cwd: projectRoot,
    stdio: [pty.slaveFd, pty.slaveFd, pty.slaveFd],
    env: { ...process.env, TERM: "xterm-256color" },
  });
  pty.closeSlave();

  const masterStream = fs.createReadStream(null as unknown as number, {
    fd: pty.masterFd,
  });
  masterStream.on("data", (chunk: Buffer) => {
    raw += chunk.toString("utf8");
  });
  masterStream.on("error", () => {
    /* fd closed during teardown */
  });

  const plain = () => normalizeTerminalText(raw);
  const write = (s: string) => {
    fs.writeSync(pty.masterFd, s);
  };

  await waitFor(() => plain().includes("❯"), 12_000);

  await keystrokes({ write, plain });

  const result = plain();

  const shutdown = async () => {
    try {
      write("\x03");
      await delay(80);
      write("exit\n");
    } catch {
      /* pty closed */
    }
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      delay(2000).then(() => child.kill("SIGKILL")),
    ]);
    masterStream.pause();
    masterStream.removeAllListeners("data");
    await delay(50);
    /* Leave PTY fd cleanup to the process exit — explicit close races the read stream. */
  };

  await shutdown();
  return result;
}

describe("E2E iris prompt (PTY)", () => {
  test(
    "space after ts keeps input on the prompt line",
    async () => {
      const plain = await runIrisSession(async ({ write, plain }) => {
        write("ts");
        await waitFor(() => plain().includes("ts"), 4000);
        write(" ");
        await delay(600);
      });

      expect(hasOrphanInputLine(plain)).toBe(false);
      expect(reservedRowsWithInd(plain)).toBe(true);
      expect(plain).toContain("❯");
    },
    22_000
  );

  test(
    "space after tt completes toward tts without breaking the prompt line",
    async () => {
      const plain = await runIrisSession(async ({ write, plain }) => {
        write("tt");
        await waitFor(() => plain().includes("tt"), 4000);
        write("s");
        await waitFor(() => plain().includes("tts"), 5000);
        write(" ");
        await delay(600);
      });

      expect(hasOrphanInputLine(plain)).toBe(false);
      expect(reservedRowsWithInd(plain)).toBe(true);
      expect(plain).toContain("❯");
    },
    25_000
  );

});
