import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPTY, type PTYSession } from "./pty";
import { lookupSpec, type Suggestion } from "./specs";
import { HistoryStore } from "./history";
import { Overlay } from "./overlay";
import { shellAliasStore } from "./shell-aliases";

function replaceLine(newText: string, cursorFromEnd: number): Buffer {
  const chunks: number[] = [];
  // Move cursor to the end of line first using right arrow
  for (let i = 0; i < cursorFromEnd; i++) {
    chunks.push(0x1b, 0x5b, 0x43);
  }
  // Clear line with Ctrl+U (0x15)
  chunks.push(0x15);
  return Buffer.concat([Buffer.from(chunks), Buffer.from(newText)]);
}

async function main() {
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  if (!isTTY) {
    console.error("iris-bun requires an interactive TTY terminal.");
    process.exit(1);
  }

  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;

  // 1. Initialize PTY
  const pty = createPTY(rows, cols);

  // 2. State & Engine
  const overlay = new Overlay();
  const historyStore = new HistoryStore();
  let activeMode: "spec" | "history" = "spec";
  let currentLine = "";
  let cursorOffset = 0;
  let userNavigated = false;

  // 3. Setup temporary shell hook directory (zero global config required)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iris-bun-"));
  const shellPath = process.env.SHELL || "/bin/zsh";
  const shellName = path.basename(shellPath);

  if (shellName === "zsh") {
    // Generate zshrc with hooks attached to FD 3
    const hookScript = `
# Load normal user configuration
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc" 2>/dev/null

if [ -n "$IRIS_FD" ]; then
  zmodload zsh/zle 2>/dev/null
  zmodload zsh/parameter 2>/dev/null
  zmodload zsh/zleparameter 2>/dev/null

  _iris_send_lbuffer() {
    print -u $IRIS_FD -N -r -- "IRIS_LINE:\${#LBUFFER}:\$BUFFER" 2>/dev/null
  }
  _iris_sync_cwd() {
    print -u $IRIS_FD -N -r -- "IRIS_CWD:\$PWD" 2>/dev/null
  }
  _iris_sync_aliases() {
    local k
    print -u $IRIS_FD -N -r -- "IRIS_ALIAS_BEGIN" 2>/dev/null
    for k in \${(k)aliases}; do
      print -u $IRIS_FD -N -r -- "IRIS_ALIAS:\$k:\${aliases[\$k]}" 2>/dev/null
    done
    print -u $IRIS_FD -N -r -- "IRIS_ALIAS_END" 2>/dev/null
  }
  _iris_precmd() {
    local exit_code=$?
    _iris_sync_cwd
    _iris_sync_aliases
    print -u $IRIS_FD -N -r -- "IRIS_CMD_STOP:\$exit_code" 2>/dev/null
  }
  _iris_preexec() {
    print -u $IRIS_FD -N -r -- "IRIS_CMD_START:$1" 2>/dev/null
  }

  autoload -Uz add-zle-hook-widget 2>/dev/null
  autoload -Uz add-zsh-hook 2>/dev/null
  add-zle-hook-widget line-pre-redraw _iris_send_lbuffer 2>/dev/null
  add-zsh-hook precmd _iris_precmd 2>/dev/null
  add-zsh-hook preexec _iris_preexec 2>/dev/null
  add-zsh-hook chpwd _iris_sync_cwd 2>/dev/null
fi
`;
    fs.writeFileSync(path.join(tmpDir, ".zshrc"), hookScript, "utf8");
  }

  // 4. Spawn child shell with PTY slave and IPC on FD 3
  const shellArgs = shellName === "zsh" ? ["-i"] : [];
  const child = spawn(shellPath, shellArgs, {
    stdio: [pty.slaveFd, pty.slaveFd, pty.slaveFd, "pipe"],
    env: {
      ...process.env,
      ZDOTDIR: shellName === "zsh" ? tmpDir : process.env.ZDOTDIR,
      IRIS_FD: "3",
      IRIS_PID: String(process.pid),
    },
  });

  // Close slave in parent process safely
  pty.closeSlave();

  // 5. Raw mode on standard input
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const cleanup = () => {
    try {
      process.stdin.setRawMode(false);
      overlay.hide();
      pty.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // 6. Handle terminal resize
  process.on("SIGWINCH", () => {
    pty.resize(process.stdout.rows || 24, process.stdout.columns || 80);
  });

  // 7. Master PTY -> stdout
  const masterStream = fs.createReadStream(null as any, { fd: pty.masterFd });
  masterStream.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });

  // Helper to re-render overlay
  const updateOverlay = () => {
    if (!currentLine.trim()) {
      const clearSeq = overlay.hide();
      if (clearSeq) process.stdout.write(clearSeq);
      return;
    }

    let items: Suggestion[] = [];
    if (activeMode === "spec") {
      items = lookupSpec(currentLine);
    } else {
      items = historyStore.search(currentLine);
    }

    overlay.setSuggestions(items);
    const cursorAtEnd = cursorOffset >= currentLine.length;
    const ghostSeq = overlay.renderGhostText(currentLine, cursorAtEnd);
    const renderSeq = overlay.render(activeMode, currentLine);
    const combined = (ghostSeq || "") + (renderSeq || "");
    if (combined) {
      process.stdout.write(combined);
    }
  };

  // 8. Shell IPC pipe -> suggestions engine
  const ipcStream = child.stdio[3];
  if (ipcStream) {
    let remainder = "";
    ipcStream.on("data", (chunk: Buffer) => {
      const str = remainder + chunk.toString();
      const parts = str.split("\0");
      remainder = parts.pop() || "";

      for (const msg of parts) {
        if (!msg) continue;

        if (msg.startsWith("IRIS_LINE:")) {
          // Format: IRIS_LINE:<offset>:<buffer>
          const firstColon = msg.indexOf(":");
          const secondColon = msg.indexOf(":", firstColon + 1);
          if (secondColon !== -1) {
            const offsetStr = msg.substring(firstColon + 1, secondColon);
            const line = msg.substring(secondColon + 1);
            cursorOffset = parseInt(offsetStr, 10) || 0;
            currentLine = line;
            userNavigated = false;
            updateOverlay();
          }
        } else if (msg.startsWith("IRIS_CMD_START")) {
          const clearSeq = overlay.hide();
          if (clearSeq) process.stdout.write(clearSeq);
          const firstColon = msg.indexOf(":");
          const executed =
            firstColon !== -1 ? msg.substring(firstColon + 1) : currentLine;
          if (executed && executed.trim()) {
            historyStore.record(executed);
          }
          currentLine = "";
          userNavigated = false;
        } else if (msg.startsWith("IRIS_CMD_STOP")) {
          const clearSeq = overlay.hide();
          if (clearSeq) process.stdout.write(clearSeq);
          currentLine = "";
          userNavigated = false;
        } else if (msg === "IRIS_ALIAS_BEGIN") {
          shellAliasStore.beginSync();
        } else if (msg === "IRIS_ALIAS_END") {
          // batch complete
        } else if (msg.startsWith("IRIS_ALIAS:")) {
          const body = msg.slice("IRIS_ALIAS:".length);
          const sep = body.indexOf(":");
          if (sep !== -1) {
            const name = body.slice(0, sep);
            const expansion = body.slice(sep + 1);
            shellAliasStore.setAlias(name, expansion);
          }
        }
      }
    });
  }

  // 9. User input interception
  process.stdin.on("data", (chunk: Buffer) => {
    // Up Arrow: \x1b[A or \x1bOA
    if (
      chunk.length === 3 &&
      chunk[0] === 0x1b &&
      (chunk[1] === 0x5b || chunk[1] === 0x4f) &&
      chunk[2] === 0x41
    ) {
      if (overlay.isVisible()) {
        userNavigated = true;
        overlay.moveCursor("up");
        const cursorAtEnd = cursorOffset >= currentLine.length;
        const ghostSeq = overlay.renderGhostText(currentLine, cursorAtEnd);
        const renderSeq = overlay.render(activeMode, currentLine);
        process.stdout.write((ghostSeq || "") + (renderSeq || ""));
        return;
      }
    }

    // Down Arrow: \x1b[B or \x1bOB
    if (
      chunk.length === 3 &&
      chunk[0] === 0x1b &&
      (chunk[1] === 0x5b || chunk[1] === 0x4f) &&
      chunk[2] === 0x42
    ) {
      if (overlay.isVisible()) {
        userNavigated = true;
        overlay.moveCursor("down");
        const cursorAtEnd = cursorOffset >= currentLine.length;
        const ghostSeq = overlay.renderGhostText(currentLine, cursorAtEnd);
        const renderSeq = overlay.render(activeMode, currentLine);
        process.stdout.write((ghostSeq || "") + (renderSeq || ""));
        return;
      }
    }

    // Right Arrow: \x1b[C or \x1bOC (accept inline ghost text completion)
    if (
      chunk.length === 3 &&
      chunk[0] === 0x1b &&
      (chunk[1] === 0x5b || chunk[1] === 0x4f) &&
      chunk[2] === 0x43
    ) {
      const cursorAtEnd = cursorOffset >= currentLine.length;
      if (overlay.isVisible() && cursorAtEnd) {
        const ghost = overlay.getGhostText(currentLine, cursorAtEnd);
        if (ghost) {
          overlay.clearGhostTextState();
          fs.writeSync(pty.masterFd, Buffer.from(ghost));
          currentLine += ghost;
          cursorOffset = currentLine.length;
          updateOverlay();
          return;
        }
      }
    }

    // Tab key: 0x09
    if (chunk.length === 1 && chunk[0] === 0x09) {
      const selected = overlay.getSelected();
      if (selected) {
        const clearSeq = overlay.hide();
        if (clearSeq) process.stdout.write(clearSeq);

        const newCmd =
          activeMode === "spec" && !selected.cmd.endsWith(" ")
            ? `${selected.cmd} `
            : selected.cmd;

        const cursorFromEnd = Math.max(0, currentLine.length - cursorOffset);
        const replaceSeq = replaceLine(newCmd, cursorFromEnd);
        fs.writeSync(pty.masterFd, replaceSeq);
        currentLine = newCmd;
        cursorOffset = newCmd.length;
        userNavigated = false;
        return;
      }
    }

    // Ctrl+R: Toggle Mode
    if (chunk.length === 1 && chunk[0] === 0x12) {
      activeMode = activeMode === "spec" ? "history" : "spec";
      userNavigated = false;
      updateOverlay();
      return;
    }

    // Esc: 0x1b
    if (chunk.length === 1 && chunk[0] === 0x1b) {
      const clearSeq = overlay.hide();
      if (clearSeq) process.stdout.write(clearSeq);
      userNavigated = false;
      return;
    }

    // Enter: 0x0d or 0x0a
    if (chunk.length === 1 && (chunk[0] === 0x0d || chunk[0] === 0x0a)) {
      const isVisible = overlay.isVisible();
      const selected = overlay.getSelected();
      const clearSeq = overlay.hide();
      if (clearSeq) process.stdout.write(clearSeq);

      // If dropdown is open and user either navigated or is on an auto-completable prefix:
      if (
        isVisible &&
        selected &&
        (userNavigated ||
          selected.cmd.toLowerCase().startsWith(currentLine.trim().toLowerCase()))
      ) {
        const cmdToSubmit = selected.cmd;
        const cursorFromEnd = Math.max(0, currentLine.length - cursorOffset);
        const replaceSeq = replaceLine(cmdToSubmit, cursorFromEnd);
        fs.writeSync(pty.masterFd, replaceSeq);
        currentLine = cmdToSubmit;
        cursorOffset = cmdToSubmit.length;
      }
      userNavigated = false;
      fs.writeSync(pty.masterFd, chunk);
      return;
    }

    // Forward keystrokes to PTY master
    fs.writeSync(pty.masterFd, chunk);
  });

  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
