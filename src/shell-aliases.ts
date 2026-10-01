import type { Suggestion } from "./specs";

const MAX_DESC = 48;

function truncateDesc(expansion: string): string {
  const oneLine = expansion.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_DESC) return oneLine;
  return `${oneLine.slice(0, MAX_DESC - 1)}…`;
}

export class ShellAliasStore {
  private aliases = new Map<string, string>();

  beginSync(): void {
    this.aliases.clear();
  }

  setAlias(name: string, expansion: string): void {
    if (name) this.aliases.set(name, expansion);
  }

  replaceAll(entries: Record<string, string>): void {
    this.beginSync();
    for (const [name, expansion] of Object.entries(entries)) {
      this.setAlias(name, expansion);
    }
  }

  hasExact(name: string): boolean {
    return this.aliases.has(name);
  }

  get(name: string): string | undefined {
    return this.aliases.get(name);
  }

  search(prefix: string): Suggestion[] {
    if (!prefix) return [];
    const results: Suggestion[] = [];
    for (const [name, expansion] of this.aliases) {
      if (name.startsWith(prefix)) {
        results.push({
          cmd: name,
          desc: truncateDesc(expansion),
          icon: "alias",
          source: "alias",
        });
      }
    }
    return results.sort((a, b) => a.cmd.localeCompare(b.cmd));
  }
}

/** Live aliases synced from the child zsh session. */
export const shellAliasStore = new ShellAliasStore();
