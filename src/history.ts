import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Suggestion } from "./specs";

export class HistoryStore {
  private history: string[] = [];

  constructor() {
    this.loadHistory();
  }

  private loadHistory() {
    const home = os.homedir();
    const candidateFiles = [
      path.join(home, ".zsh_history"),
      path.join(home, ".bash_history"),
    ];

    for (const file of candidateFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, "utf8");
          const lines = content.split("\n");
          for (let i = lines.length - 1; i >= 0 && this.history.length < 500; i--) {
            let line = lines[i].trim();
            if (!line) continue;
            // parse zsh extended history format: ": 1234567890:0;command"
            if (line.startsWith(": ") && line.includes(";")) {
              line = line.split(";").slice(1).join(";");
            }
            if (line && !this.history.includes(line)) {
              this.history.push(line);
            }
          }
          break;
        } catch {
          // ignore
        }
      }
    }
  }

  public record(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    this.history = [trimmed, ...this.history.filter((c) => c !== trimmed)];
  }

  public search(query: string, maxItems = 10): Suggestion[] {
    const q = query.trim().toLowerCase();
    const results: Suggestion[] = [];

    for (const item of this.history) {
      if (!q || item.toLowerCase().includes(q)) {
        results.push({
          cmd: item,
          desc: "Recent command",
          icon: "history",
          source: "history",
        });
        if (results.length >= maxItems) break;
      }
    }
    return results;
  }
}
