# Testing bar (iris-bun)

## Default gate

```bash
bun test
```

Must pass before merge. Trellis promote/issue-start uses the **unit** suite (`bun test` in `.trellis/tests.json`).

## Layers

| Layer | What | Where |
| ----- | ---- | ----- |
| **Golden table** | Fixed `input → sorted cmd[]` for walker token positions | `test/completion-golden.test.ts` |
| **Wire snapshots** | Checked-in `commands --json` fixtures; parse + key affordances | `test/fixtures/*.snapshot.json` |
| **Unit / integration** | Registry, overlay, PTY, zsh FD3, shell aliases | `test/iris.test.ts`, `test/shell-aliases.test.ts`, `test/completion-projection.test.ts` |
| **PTY prompt e2e** | Spawns full `iris-bun` on a PTY; types `ts` / `tts` + space; asserts no orphan input line | `bun test test/e2e-prompt-space.test.ts` |
| **Live binary** | Real `tts commands --json` on PATH | `BUN_TEST_REAL_TTS=1 bun run test:live-tts` |

## Refresh catalog fixtures

When `tts` (or future CLIs) change catalog shape:

```bash
bun run test:fixtures:refresh
```

Commit updated `test/fixtures/tts-commands.snapshot.json` with the code change.

## CI

- **ubuntu:** `bun test` (hermetic).
- **macos (optional):** live `tts` test if binary on PATH (`continue-on-error`).

## PTY prompt regression

```bash
bun run test:e2e-prompt
```

~15s locally (loads your zsh via iris hook). Catches overlay/prompt desync after **space** (orphan `ts` row off the `❯` line).

## Not in scope

- Playwright, bash PTY.
- tsh selection grammar (`where`, `$n`) — os-sandbox `tsh-complete`.
