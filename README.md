# iris-bun (Proof of Concept)

A proof-of-concept shell auto-completion and suggestion engine built with **Bun** and **TypeScript**, inspired by [IRIS](https://github.com/versenilvis/iris).

## How it works

1. **Native POSIX PTY via `bun:ffi` (`src/pty.ts`)**:
   - Calls `openpty` and `ioctl(TIOCSWINSZ)` directly from the system C library (`libSystem.B.dylib` on macOS / `libc.so.6` on Linux).
   - No C++ compilation or native node addons required.

2. **IPC on FD 3 (`src/index.ts`)**:
   - Spawns the child shell (`zsh` or `bash`) with `stdio: [slaveFd, slaveFd, slaveFd, "pipe"]`.
   - Passes the pipe as file descriptor 3 (`IRIS_FD=3`) to the child shell.
   - Automatically injects the shell hook in a temporary `ZDOTDIR` that sources your existing `~/.zshrc`.

3. **Rich Specs & PATH Binary Scanning (`src/specs.ts`)**:
   - Full specs for standard POSIX utilities (`ls`, `cd`, `grep`, `cat`, `rm`, `cp`, `mv`, `mkdir`, `find`, `curl`, `tar`, etc.) with flag/option descriptions.
   - High-performance `$PATH` scanner for dynamic system binaries tagged with the `" system "` badge.

4. **Keystroke Interception & Terminal Overlay (`src/overlay.ts`)**:
   - Terminal raw mode (`process.stdin.setRawMode(true)`).
   - **Inline gray ghost text**: Real-time completion string rendered directly at the cursor for the top suggestion.
   - **Right Arrow (`→`)**: Instantly accepts inline ghost text completions.
   - **Tab (`⇥`)**: Accepts the currently selected dropdown item.
   - **Enter (`↵`)**: Executes the highlighted suggestion directly.
   - **Up/Down (`↑`/`↓`)**: Navigates the dropdown with circular wrap-around, dynamically updating the ghost text.
   - **Ctrl+R**: Toggles between command specs and command history.
   - **Esc**: Dismisses the overlay.

## Quick Start

### Run with Bun
```bash
cd /Users/trentbrew/TURTLE/lab/sandbox/iris-bun
bun run start
```

### Or run the compiled standalone binary
```bash
./iris-bun
```

### Try these inside the session
- Type `l` or `ls ` (shows `ls` options `-l`, `-la`, `-lh`, `-R` with inline ghost text)
- Type `grep ` or `cd ` or `git che`
- Press `→` (Right Arrow) to accept the inline gray ghost text
- Press `Tab` to select and fill the command
- Press `Enter` to directly run the selected item
- Press `Ctrl+R` to switch between command specs and command history
- Type `exit` to return to your normal terminal
