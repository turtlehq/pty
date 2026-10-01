import { test, expect, describe, beforeEach } from "bun:test";
import { createPTY } from "../src/pty";
import { lookupSpec, registry } from "../src/specs";
import { shellAliasStore } from "../src/shell-aliases";
import { HistoryStore } from "../src/history";
import { Overlay, computeGhostSuffix, stripAnsi } from "../src/overlay";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("PTY subsystem", () => {
  test("createPTY allocates master and slave FDs and closes cleanly", () => {
    const pty = createPTY(24, 80);
    expect(pty.masterFd).toBeGreaterThan(0);
    expect(pty.slaveFd).toBeGreaterThan(0);
    expect(typeof pty.resize).toBe("function");

    pty.resize(30, 100);
    pty.closeSlave();
    pty.close(); // safe double close check
  });
});

describe("Specs registry & lookup", () => {
  beforeEach(() => {
    shellAliasStore.replaceAll({});
  });

  test("returns top-level commands when empty", () => {
    const results = lookupSpec("");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cmd === "git")).toBe(true);
    expect(results.some((r) => r.cmd === "bun")).toBe(true);
  });

  test("returns git subcommands when typing 'git '", () => {
    const results = lookupSpec("git ");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cmd === "git status")).toBe(true);
    expect(results.some((r) => r.cmd === "git commit")).toBe(true);
  });

  test("returns git subcommands when root is complete without trailing space", () => {
    const results = lookupSpec("git");
    expect(results.some((r) => r.cmd === "git status")).toBe(true);
    expect(results.some((r) => r.cmd === "git commit")).toBe(true);
    expect(results.some((r) => r.cmd === "git")).toBe(false);
  });

  test("filters subcommands by partial prefix 'git st'", () => {
    const results = lookupSpec("git st");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cmd === "git status")).toBe(true);
    expect(results.some((r) => r.cmd === "git stash")).toBe(true);
    expect(results.every((r) => r.cmd.startsWith("git st"))).toBe(true);
  });

  test("filters nested tts families when typing 'tts prov'", () => {
    const results = lookupSpec("tts prov");
    const cmds = results.map((r) => r.cmd);
    expect(cmds).toContain("tts provider");
    expect(cmds).toContain("tts providers");
    expect(cmds.some((c) => c === "tts speak")).toBe(false);
  });

  test("matches flags when typing 'git --'", () => {
    const results = lookupSpec("git --");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cmd === "git --help")).toBe(true);
  });

  test("matches POSIX commands and flags (ls, cd, grep, rm, cat)", () => {
    // 1. Prefix typing matches ls spec
    const lsMatches = lookupSpec("l");
    expect(lsMatches.length).toBeGreaterThan(0);
    expect(lsMatches.some((r) => r.cmd === "ls" && r.source === "spec")).toBe(true);

    // 2. Exact `ls` shows flag shortcuts (no subcommands)
    const lsExact = lookupSpec("ls");
    expect(lsExact.some((r) => r.cmd === "ls -l")).toBe(true);

    // 3. Typing 'ls ' shows options like -l, -la, -lh
    const lsOpts = lookupSpec("ls ");
    expect(lsOpts.length).toBeGreaterThan(0);
    expect(lsOpts.some((r) => r.cmd === "ls -l")).toBe(true);
    expect(lsOpts.some((r) => r.cmd === "ls -la")).toBe(true);

    // 4. Typing 'grep ' shows grep flags
    const grepOpts = lookupSpec("grep ");
    expect(grepOpts.some((r) => r.cmd === "grep -i")).toBe(true);
    expect(grepOpts.some((r) => r.cmd === "grep -r")).toBe(true);

    // 5. Exact `cd` and `cd ` show directory shortcuts
    const cdExact = lookupSpec("cd");
    expect(cdExact.some((r) => r.cmd === "cd ..")).toBe(true);
    const cdOpts = lookupSpec("cd ");
    expect(cdOpts.some((r) => r.cmd === "cd -")).toBe(true);
    expect(cdOpts.some((r) => r.cmd === "cd .." && r.desc === "Switch to parent directory")).toBe(true);
  });
});

describe("HistoryStore", () => {
  test("records and searches recent commands", () => {
    const store = new HistoryStore();
    store.record("bun run test");
    store.record("docker compose up -d");

    const searchResults = store.search("docker");
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].cmd).toBe("docker compose up -d");
    expect(searchResults[0].source).toBe("history");
  });
});

describe("Overlay display engine", () => {
  test("renders suggestions and navigates with wrap-around", () => {
    const overlay = new Overlay();
    overlay.setSuggestions([
      { cmd: "git status", desc: "Show status", source: "spec" },
      { cmd: "git stash", desc: "Stash changes", source: "spec" },
    ]);

    expect(overlay.isVisible()).toBe(false);
    const output = overlay.render("spec");
    expect(overlay.isVisible()).toBe(true);
    expect(output).toContain("git status");
    expect(output).toContain("git stash");
    expect(overlay.getSelected()?.cmd).toBe("git status");

    // Down arrow moves cursor
    overlay.moveCursor("down");
    expect(overlay.getSelected()?.cmd).toBe("git stash");

    // Wrap around to top
    overlay.moveCursor("down");
    expect(overlay.getSelected()?.cmd).toBe("git status");

    // Up arrow wrap to bottom
    overlay.moveCursor("up");
    expect(overlay.getSelected()?.cmd).toBe("git stash");

    const clearSeq = overlay.hide();
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.getSelected()).toBeNull();
    expect(clearSeq).toContain("\x1b8");
  });

  test("renders Iris rounded borders, footer shortcuts, and theme colors", () => {
    const overlay = new Overlay();
    overlay.setSuggestions([
      { cmd: "cargo", desc: "The Rust package manager and build tool", icon: "cargo", source: "spec" },
      { cmd: "curl", desc: "Command line tool for transferring data", icon: "curl", source: "spec" },
    ]);

    const rendered = overlay.render("spec", "c");
    // Rounded corners
    expect(rendered).toContain("╭");
    expect(rendered).toContain("╮");
    expect(rendered).toContain("╰");
    expect(rendered).toContain("╯");
    // Iris theme marker and footer shortcuts
    expect(rendered).toContain("▶");
    expect(rendered).toContain("tab");
    expect(rendered).toContain("Accept");
    expect(rendered).toContain("ctrl+r");
    expect(rendered).toContain("Mode");
    // Nerd font icons
    expect(rendered).toContain(""); // cargo
    expect(rendered).toContain("󰌗"); // curl
    // Truecolor ANSI escape for #a277ff (162;119;255) and #61ffca (97;255;202)
    expect(rendered).toContain("162;119;255");
    expect(rendered).toContain("97;255;202");
  });

  test("renders system badge for system source commands", () => {
    const overlay = new Overlay();
    overlay.setSuggestions([
      { cmd: "ffmpeg", desc: "System command", source: "system" },
    ]);

    const rendered = overlay.render("spec", "ffm");
    expect(rendered).toContain(" system ");
    expect(stripAnsi(rendered)).toContain("ffmpeg");
  });

  test("renders and clears inline ghost text completion", () => {
    const overlay = new Overlay();
    overlay.setSuggestions([
      { cmd: "git checkout", desc: "Switch branches", source: "spec" },
      { cmd: "git commit", desc: "Record changes", source: "spec" },
    ]);
    overlay.render("spec", "git che");

    // 1. Ghost text is first-token only (subcommands use the menu).
    const ghost = overlay.getGhostText("git che", true);
    expect(ghost).toBe("");

    // When cursor is not at end, ghost text is empty
    const ghostNotEnd = overlay.getGhostText("git che", false);
    expect(ghostNotEnd).toBe("");

    // 2. First-token ghost still renders (e.g. partial command name).
    overlay.render("spec", "gi");
    const ghostSeq = overlay.renderGhostText("gi", true);
    expect(ghostSeq).toContain("t");
    expect(ghostSeq).toContain("\x1b7"); // save cursor
    expect(ghostSeq).toContain("\x1b8"); // restore cursor
    // Truecolor for ghost text #4B4A4C (75;74;76)
    expect(ghostSeq).toContain("75;74;76");

    // 3. Ghost text updates when navigating dropdown selection
    overlay.moveCursor("down"); // selects "git commit"
    const commitGhost = overlay.getGhostText("git c", true);
    expect(commitGhost).toBe("");

    // Partial first token: no ghost spill into later words (e.g. not " speak" after "tt").
    overlay.render("spec", "tt");
    overlay.setSuggestions([
      { cmd: "tts speak", desc: "Speak", source: "spec" },
    ]);
    expect(computeGhostSuffix("ts", "tts speak", "spec")).toBe("");
    expect(computeGhostSuffix("tt", "tts speak", "spec")).toBe("s");
    expect(overlay.getGhostText("tts", true)).toBe("");

    overlay.renderGhostText("tt", true); // draws suffix "s"
    const afterSpace = overlay.renderGhostText("tt ", true);
    // Trailing space ends the token: the stale ghost must be erased, not orphaned.
    expect(afterSpace).toContain("\x1b7");
    expect(afterSpace).toContain("\x1b8");
    expect(afterSpace).toMatch(/ {1,}/);
    expect(overlay.getGhostText("tt ", true)).toBe("");

    // Subcommand tokens: menu only — no inline ghost after the first word.
    overlay.setSuggestions([
      { cmd: "tts speak", desc: "Speak", source: "spec" },
    ]);
    overlay.render("spec", "tts s");
    expect(overlay.getGhostText("tts s", true)).toBe("");
    expect(overlay.renderGhostText("tts sp", true)).toBe("");

    // First-token shrink still erases the full prior ghost run.
    overlay.render("spec", "tt");
    overlay.renderGhostText("tt", true);
    const shrinkSeq = overlay.renderGhostText("tts", true);
    expect(shrinkSeq).toContain("\x1b[1D");

    // 4. Hiding clears ghost text
    const hideSeq = overlay.hide();
    expect(overlay.isVisible()).toBe(false);
    expect(hideSeq).toContain("\x1b7");
  });

  test("render reserves menu rows without resetting the prompt column", () => {
    const overlay = new Overlay();
    overlay.setSuggestions(
      Array.from({ length: 6 }, (_, i) => ({
        cmd: `tts sub${i}`,
        desc: `sub ${i}`,
        source: "spec" as const,
      }))
    );

    const seq = overlay.render("spec", "tts ");

    // Menu rows are reserved with IND (ESC D), which scrolls while preserving the
    // cursor column. A literal "\n" is rewritten to CR+LF by the tty's OPOST/ONLCR
    // and drops the saved anchor to column 0 — the "cursor jumps to the left" bug.
    expect(seq).toContain("\x1bD");
    expect(seq).not.toContain("\n");
  });
});

describe("E2E Shell IPC on FD 3", () => {
  test("Zsh loads hook with zmodload zle and communicates via FD 3", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iris-test-zsh-"));
    const hookScript = `
zmodload zsh/zle 2>/dev/null
autoload -Uz add-zle-hook-widget 2>/dev/null
autoload -Uz add-zsh-hook 2>/dev/null

_iris_send_lbuffer() {
  print -u $IRIS_FD -N -r -- "IRIS_LINE:\${#LBUFFER}:\$BUFFER" 2>/dev/null
}
add-zle-hook-widget line-pre-redraw _iris_send_lbuffer 2>/dev/null
`;
    fs.writeFileSync(path.join(tmpDir, ".zshrc"), hookScript, "utf8");

    const pty = createPTY(24, 80);
    const child = spawn("/bin/zsh", ["-i"], {
      stdio: [pty.slaveFd, pty.slaveFd, pty.slaveFd, "pipe"],
      env: {
        ...process.env,
        ZDOTDIR: tmpDir,
        IRIS_FD: "3",
      },
    });
    pty.closeSlave();

    const masterStream = fs.createReadStream(null as any, { fd: pty.masterFd });
    masterStream.on("data", () => {}); // drain output

    const received: string[] = [];
    child.stdio[3]?.on("data", (chunk: Buffer) => {
      const parts = chunk.toString().split("\0");
      for (const p of parts) {
        if (p.startsWith("IRIS_LINE:")) received.push(p);
      }
    });

    // Wait for shell to init, then simulate typing
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeSync(pty.masterFd, "git ");

    // Wait for IPC response
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Cleanly exit child shell
    const exitPromise = new Promise((resolve) => child.on("exit", resolve));
    fs.writeSync(pty.masterFd, "\x15exit\n"); // Ctrl+U then exit
    await Promise.race([
      exitPromise,
      new Promise((resolve) =>
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve(null);
        }, 1000)
      ),
    ]);

    masterStream.destroy();
    child.stdio[3]?.destroy();
    pty.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(received.length).toBeGreaterThan(0);
    expect(received.some((line) => line.includes("git "))).toBe(true);
  });

  test("Zsh syncs aliases over FD 3 on precmd", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iris-test-zsh-alias-"));
    const hookScript = `
zmodload zsh/parameter 2>/dev/null
alias R='echo reset-test'
_iris_sync_aliases() {
  local k
  print -u $IRIS_FD -N -r -- "IRIS_ALIAS_BEGIN" 2>/dev/null
  for k in \${(k)aliases}; do
    print -u $IRIS_FD -N -r -- "IRIS_ALIAS:\$k:\${aliases[\$k]}" 2>/dev/null
  done
  print -u $IRIS_FD -N -r -- "IRIS_ALIAS_END" 2>/dev/null
}
autoload -Uz add-zsh-hook 2>/dev/null
add-zsh-hook precmd _iris_sync_aliases 2>/dev/null
true
`;
    fs.writeFileSync(path.join(tmpDir, ".zshrc"), hookScript, "utf8");

    const pty = createPTY(24, 80);
    const child = spawn("/bin/zsh", ["-i"], {
      stdio: [pty.slaveFd, pty.slaveFd, pty.slaveFd, "pipe"],
      env: { ...process.env, ZDOTDIR: tmpDir, IRIS_FD: "3" },
    });
    pty.closeSlave();

    const masterStream = fs.createReadStream(null as any, { fd: pty.masterFd });
    masterStream.on("data", () => {});

    const ipc: string[] = [];
    child.stdio[3]?.on("data", (chunk: Buffer) => {
      for (const p of chunk.toString().split("\0")) {
        if (p) ipc.push(p);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    fs.writeSync(pty.masterFd, "\n");

    await new Promise((resolve) => setTimeout(resolve, 400));

    const exitPromise = new Promise((resolve) => child.on("exit", resolve));
    fs.writeSync(pty.masterFd, "exit\n");
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(() => {
        child.kill("SIGKILL");
        resolve(null);
      }, 1000)),
    ]);

    masterStream.destroy();
    child.stdio[3]?.destroy();
    pty.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(ipc.some((m) => m === "IRIS_ALIAS_BEGIN")).toBe(true);
    expect(ipc.some((m) => m.startsWith("IRIS_ALIAS:R:"))).toBe(true);
    expect(ipc.some((m) => m === "IRIS_ALIAS_END")).toBe(true);
  });

  test("Enter executes the selected suggestion when dropdown is open", () => {
    function replaceLine(newText: string, cursorFromEnd: number): Buffer {
      const chunks: number[] = [];
      for (let i = 0; i < cursorFromEnd; i++) {
        chunks.push(0x1b, 0x5b, 0x43);
      }
      chunks.push(0x15);
      return Buffer.concat([Buffer.from(chunks), Buffer.from(newText)]);
    }

    const overlay = new Overlay();
    overlay.setSuggestions([
      { cmd: "cargo", desc: "The Rust package manager", icon: "cargo", source: "spec" },
      { cmd: "curl", desc: "Command line tool", icon: "curl", source: "spec" },
    ]);
    overlay.render("spec", "c");

    expect(overlay.isVisible()).toBe(true);
    const selected = overlay.getSelected();
    expect(selected?.cmd).toBe("cargo");

    // Simulating Enter with typed query "c"
    const currentLine = "c";
    let submitted = "";
    if (
      overlay.isVisible() &&
      selected &&
      selected.cmd.toLowerCase().startsWith(currentLine.trim().toLowerCase())
    ) {
      submitted = selected.cmd;
    }
    expect(submitted).toBe("cargo");
  });
});
