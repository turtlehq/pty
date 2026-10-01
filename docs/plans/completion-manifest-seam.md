# Completion manifest seam (iris-bun ↔ ADR-0026 ↔ turtlenote)

iris-bun nested suggestions consume a **completion projection** — a compiler target from the command manifest (ADR-0026), not the kernel API.

## Semantic model

| Concept | Meaning | Executes? |
| ------- | ------- | --------- |
| **Selection** | Entities in scope (IR, `$n`, BrowseSelection, pick buffer) | Context only |
| **Facet** | Layout (`kind:as`, `--view kanban`, table vs board) | Read-only |
| **Affordance / verb** | Operation (`entity.get`, `tag`, `openRecord`) | Handler + capability |

Human CLI spelling (`entity list`, `tts provider set`) is a **legacy projection** for discoverability. Agents and tools should emit **Command IR** / handler ids (ADR-0016).

## Code mapping

| Layer | iris-bun | os-sandbox | turtlenote |
| ----- | -------- | ---------- | ---------- |
| Source of truth (target) | manifest row | ADR-0026 compiler | same manifest slice |
| Interim v1 wire format | `commands --json` (`LegacyCliProjectionJson`) | `catalogJson()` / `tts commands --json` | N/A in shell |
| Walker | [`suggestCliAffordances`](../src/completion-projection.ts) | [`lib/completion-projection-bridge.mjs`](../../../../OS/os-sandbox/lib/completion-projection-bridge.mjs) re-export | filter `recordOperations` by capability |
| Stable id | `affordanceId` on suggestions | handler id in manifest | `RecordOperationId` ↔ manifest `handler` |
| Presentation | overlay ANSI | `formatTerminal` | Thing facets / cards |

## Manifest row (north star)

One row per affordance:

- `id` / `handler` — stable across surfaces
- `args` / `options` — same schema for tsh forms and web
- `capability` — ADR-0010 grant
- `class` — R/G/X (ADR-0016)
- `presentation.human` — terminal layout only
- `cliSpelling` — optional token path for completion compiler

Swap loader in [`catalog.ts`](../src/catalog.ts): prefer manifest `completion.json` over `commands --json` when present.

## turtlenote

- **Do not** make the web app speak tsh strings.
- `recordOperations`: portable **metadata** from manifest; `run` stays host closure.
- Browse selection ≈ tsh session selection; wire `$n` / `it` when embedding shell.

## References

- os-sandbox [ADR-0026](file:///Users/trentbrew/TURTLE/OS/os-sandbox/docs/adr/0026-declarative-command-manifest.md)
- os-sandbox [ADR-0016](file:///Users/trentbrew/TURTLE/OS/os-sandbox/docs/adr/0016-tsh-command-language.md)
- Guest selection completion: `guest/tsh-complete.mjs` (unchanged responsibility)
