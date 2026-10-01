import type { Suggestion } from "./specs";

export const irisTheme = {
  border: "#a277ff",
  accent: "#61ffca",
  muted: "#6d6a7f",
  text: "#edecee",
  textSel: "#ffffff",
  key: "#a277ff",
  match: "#61ffca",
  desc: "#9692a8",
  descSel: "#edecee",
  selBg: "#3d375e",
  selText: "#110f18",
  scrollInfo: "#a277ff",
  ghostText: "#4B4A4C",
  history: "#1a2d36",
  historySel: "#61ffca",
  sys: "#1e1d28",
  sysSel: "#a277ff",
  alias: "#2a2342",
  aliasSel: "#a277ff",
};

export const iconMap: Record<string, string> = {
  git: "󰊢",
  gh: "",
  docker: "",
  "docker-compose": "",
  podman: "󰡨",
  go: "",
  golang: "",
  python: "",
  python3: "",
  pip: "",
  pip3: "",
  pipx: "",
  conda: "󰜗",
  node: "",
  npm: "",
  npx: "",
  pnpm: "",
  pnpx: "",
  bun: "",
  bunx: "",
  yarn: "",
  deno: "",
  rust: "",
  cargo: "",
  rustup: "",
  rustc: "",
  java: "",
  javac: "",
  kotlin: "",
  mvn: "",
  gradle: "",
  ruby: "",
  gem: "",
  rails: "",
  php: "",
  composer: "",
  lua: "",
  nvim: "",
  vim: "",
  vi: "",
  nano: "󰔷",
  emacs: "",
  code: "󰨞",
  subl: "",
  cd: "",
  ls: "",
  eza: "",
  exa: "",
  lsd: "",
  tree: "",
  pwd: "",
  cat: "",
  bat: "",
  less: "",
  more: "",
  head: "",
  tail: "",
  grep: "",
  rg: "",
  ripgrep: "",
  find: "",
  fd: "",
  ssh: "󰣀",
  scp: "󰣀",
  sftp: "󰣀",
  rsync: "󰣀",
  kubectl: "󱃾",
  helm: "󱃾",
  k9s: "󱃾",
  minikube: "󱃾",
  terraform: "󱁢",
  ansible: "󰂯",
  aws: "󰸏",
  gcloud: "󱇶",
  tmux: "󰓓",
  screen: "󰓓",
  curl: "󰌗",
  wget: "󰌗",
  brew: "🍺",
  nginx: "󰟀",
  mysql: "",
  psql: "",
  mongosh: "󱀝",
  "redis-cli": "󰆧",
  sqlite3: "",
  firebase: "󰐠",
  supabase: "󰙦",
  vercel: "▲",
  netlify: "󰚊",
  hugo: "󰁆",
  next: "▲",
  vite: "󱋡",
  webpack: "󰜫",
  eslint: "󰱺",
  prettier: "󰬗",
  jest: "󰗚",
  pytest: "",
  make: "󰷈",
  cmake: "󰷈",
  just: "󰷈",
  nmap: "󰒍",
  ffmpeg: "󰕼",
  ollama: "󰫢",
  ai: "󰫢",
  llm: "󰫢",
  openai: "󰫢",
  groq: "󰫢",
  gemini: "󰫢",
  claude: "󰫢",
  anthropic: "󰫢",
  copilot: "󰫢",
  chatgpt: "󰚩",
  systemctl: "󰒓",
  htop: "󰍛",
  btop: "󰍛",
  top: "󰍛",
  tar: "",
  zip: "",
  unzip: "",
  alias: "",
  abbr: "",
  history: "",
  atuin: "󰳗",
  system: "",
  root: "",
  mas: "",
};

export function lookupIcon(key?: string): string {
  if (!key) return "❯";
  const k = key.toLowerCase().trim();
  if (iconMap[k]) return iconMap[k];
  if (k.length > 0 && k[0] >= "0" && k[0] <= "9") return "";
  return "❯";
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function fg(colorHex: string, text: string): string {
  const [r, g, b] = hexToRgb(colorHex);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function bg(colorHex: string, text: string): string {
  const [r, g, b] = hexToRgb(colorHex);
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b[78]/g, "");
}

function truncate(s: string, width: number): string {
  const chars = [...s];
  return chars.slice(0, width).join("");
}

function visualWidth(s: string): number {
  return [...stripAnsi(s)].length;
}

function fixedWidth(s: string, width: number): string {
  const vWidth = visualWidth(s);
  if (vWidth === width) return s;
  if (vWidth > width) {
    const chars = [...stripAnsi(s)];
    return chars.slice(0, width - 1).join("") + "…";
  }
  return s + " ".repeat(width - vWidth);
}

function titledEdge(
  left: string,
  right: string,
  inner: number,
  content: string,
  borderColor: string,
  leftPad: number
): string {
  const contentWidth = visualWidth(content);
  if (!content) {
    return fg(borderColor, left + "─".repeat(inner) + right);
  }
  let leftDash = leftPad;
  if (leftPad < 0) {
    leftDash = Math.max(0, Math.floor((inner - contentWidth) / 2));
  }
  let rightDash = inner - leftDash - contentWidth;
  if (rightDash < 0) {
    leftDash = Math.max(0, leftDash + rightDash);
    rightDash = 0;
  }
  return (
    fg(borderColor, left + "─".repeat(leftDash)) +
    content +
    fg(borderColor, "─".repeat(rightDash) + right)
  );
}

function renderMatchedTitle(
  title: string,
  typed: string,
  selected: boolean,
  width: number
): string {
  const display = fixedWidth(title, width);
  const q = typed.trim().toLowerCase();
  const lowerDisplay = display.toLowerCase();
  const textColor = selected ? irisTheme.textSel : irisTheme.text;

  if (!q || !lowerDisplay.startsWith(q)) {
    return fg(textColor, display);
  }

  const matchLen = q.length;
  const matchPart = display.slice(0, matchLen);
  const restPart = display.slice(matchLen);

  return bold(fg(irisTheme.match, matchPart)) + fg(textColor, restPart);
}

/** Inline ghost suffix only — never spill into later tokens while the first token is incomplete. */
export function computeGhostSuffix(
  buffer: string,
  topCmd: string,
  source?: Suggestion["source"]
): string {
  if (!buffer || buffer.endsWith(" ")) return "";

  if (source === "alias" && topCmd === buffer) return "";

  const bufferHasSpace = /\s/.test(buffer);

  if (source === "alias" && topCmd.startsWith(buffer)) {
    return topCmd.slice(buffer.length);
  }

  if (!bufferHasSpace) {
    const cmdFirst = topCmd.split(/\s+/)[0] ?? topCmd;
    if (!cmdFirst.toLowerCase().startsWith(buffer.toLowerCase())) {
      return "";
    }
    if (buffer.length < cmdFirst.length) {
      return cmdFirst.slice(buffer.length);
    }
    return "";
  }

  if (topCmd.toLowerCase().startsWith(buffer.toLowerCase())) {
    return topCmd.slice(buffer.length);
  }
  return "";
}

/** Inline ghost is for the first token only; subcommand typing uses the menu. */
export function ghostEligibleBuffer(buffer: string): boolean {
  if (!buffer || buffer.endsWith(" ")) return false;
  return !buffer.includes(" ");
}

export class Overlay {
  private lastDrawnLines = 0;
  private selectedIndex = 0;
  private startIdx = 0;
  private suggestions: Suggestion[] = [];
  private visible = false;

  public setSuggestions(items: Suggestion[]) {
    this.suggestions = items;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = Math.max(0, items.length - 1);
    }
  }

  public getSelected(): Suggestion | null {
    if (!this.visible || this.suggestions.length === 0) return null;
    return this.suggestions[this.selectedIndex] || null;
  }

  public moveCursor(direction: "up" | "down"): boolean {
    if (!this.visible || this.suggestions.length <= 1) return false;
    if (direction === "down") {
      this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
    } else {
      this.selectedIndex =
        (this.selectedIndex - 1 + this.suggestions.length) %
        this.suggestions.length;
    }
    return true;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  private lastGhostLen = 0;

  public getGhostText(buffer: string, cursorAtEnd: boolean): string {
    if (
      !this.visible ||
      this.suggestions.length === 0 ||
      !cursorAtEnd ||
      !buffer ||
      !ghostEligibleBuffer(buffer)
    ) {
      return "";
    }
    const top =
      this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length
        ? this.suggestions[this.selectedIndex]
        : this.suggestions[0];
    const topCmd = top.cmd;

    return computeGhostSuffix(buffer, topCmd, top.source);
  }

  public clearGhostTextState(): void {
    this.lastGhostLen = 0;
  }

  public hideGhostTextSync(): string {
    if (this.lastGhostLen > 0) {
      const n = this.lastGhostLen;
      this.lastGhostLen = 0;
      return "\x1b7" + " ".repeat(n) + "\x1b8";
    }
    return "";
  }

  public renderGhostText(buffer: string, cursorAtEnd: boolean): string {
    if (!this.visible || this.suggestions.length === 0) {
      return this.hideGhostTextSync();
    }

    if (!ghostEligibleBuffer(buffer)) {
      return this.hideGhostTextSync();
    }

    let ghostText = "";
    if (cursorAtEnd && buffer) {
      const top =
        this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length
          ? this.suggestions[this.selectedIndex]
          : this.suggestions[0];
      ghostText = computeGhostSuffix(buffer, top.cmd, top.source);
    }

    if (ghostText !== "") {
      const termCols = process.stdout.columns || 80;
      const totalCol = buffer.length;
      const cursorCol = termCols > 0 ? totalCol % termCols : totalCol;
      const availableCols = termCols - cursorCol;
      if (availableCols <= 0) {
        ghostText = "";
      } else if (visualWidth(ghostText) > availableCols) {
        ghostText = truncate(ghostText, availableCols);
      }
    }

    if (ghostText === "" && this.lastGhostLen === 0) {
      return "";
    }

    const ghostWidth = visualWidth(ghostText);
    const eraseLen = this.lastGhostLen;

    // Wipe the previous ghost run entirely, then draw from the buffer end.
    // Partial pad (oldLen - newLen) overwrote the last typed char when the
    // suffix shrank (e.g. tts s + "peak" → tts sp + "eak").
    let out = "\x1b7";
    if (eraseLen > 0) {
      out += " ".repeat(eraseLen);
      out += `\x1b[${eraseLen}D`;
    }
    if (ghostText !== "") {
      out += fg(irisTheme.ghostText, ghostText);
    }
    out += "\x1b8";
    this.lastGhostLen = ghostWidth;
    return out;
  }

  public hide(): string {
    const clearGhost = this.hideGhostTextSync();
    const clearSeq = this.clear();
    this.visible = false;
    this.suggestions = [];
    this.selectedIndex = 0;
    this.startIdx = 0;
    return clearGhost + clearSeq;
  }

  public clear(): string {
    if (this.lastDrawnLines === 0) return "";
    let out = "\x1b7"; // Save cursor position
    for (let i = 1; i <= this.lastDrawnLines; i++) {
      out += `\x1b8\x1b[${i}B\r\x1b[2K`; // Restore to prompt, move down i lines, clear line
    }
    out += "\x1b8"; // Restore cursor back to prompt
    this.lastDrawnLines = 0;
    return out;
  }

  public render(mode: "spec" | "history", query = ""): string {
    if (this.suggestions.length === 0) {
      return this.hide();
    }

    this.visible = true;

    // Terminal width & box dimensions matching iris (default 76 cols)
    const termCols = process.stdout.columns || 80;
    let boxWidth = 76;
    if (boxWidth > termCols) {
      boxWidth = termCols;
    }
    if (boxWidth < 40) {
      boxWidth = 40;
    }

    const targetCol = 0; // Aligned with terminal line
    const inner = boxWidth - 2;

    const maxItems = 6;
    const windowSize = Math.min(this.suggestions.length, maxItems);

    // Keep 1 row of scroll context (scrolloff = 1)
    const scrolloff = windowSize <= 3 ? 0 : 1;
    if (this.selectedIndex < this.startIdx + scrolloff) {
      this.startIdx = this.selectedIndex - scrolloff;
    }
    if (this.selectedIndex > this.startIdx + windowSize - 1 - scrolloff) {
      this.startIdx = this.selectedIndex - windowSize + 1 + scrolloff;
    }
    if (this.startIdx < 0) this.startIdx = 0;
    if (this.startIdx > this.suggestions.length - windowSize) {
      this.startIdx = Math.max(0, this.suggestions.length - windowSize);
    }
    if (this.startIdx < 0) this.startIdx = 0;

    const start = this.startIdx;
    const end = start + windowSize;
    const totalLines = windowSize + 2; // + 2 for borders

    let output = "";

    const prevDrawnLines = this.lastDrawnLines;
    const extraLines =
      prevDrawnLines === 0 ? totalLines : Math.max(0, totalLines - prevDrawnLines);

    if (extraLines > 0) {
      // Reserve menu rows, scrolling the screen if needed. Use IND (ESC D)
      // rather than "\n": the tty's OPOST/ONLCR rewrites "\n" to CR+LF, which
      // resets the column to 0 and makes the saved anchor (and thus the cursor)
      // jump to the left. IND scrolls while preserving the column, so CUU back
      // up lands on the true anchor with the cursor still after the input.
      output += "\x1bD".repeat(extraLines);
      output += `\x1b[${extraLines}A`;
    }

    output += "\x1b7";

    const moveToTarget = () => {
      let s = "\r";
      if (targetCol > 0) {
        s += `\x1b[${targetCol}C`;
      }
      return s;
    };

    const gotoMenuLine = (lineDown: number) =>
      `\x1b8\x1b[${lineDown}B\r\x1b[2K${moveToTarget()}`;

    // 1. Top border with scroll counter
    output += gotoMenuLine(1);

    let scrollInfo = "";
    if (this.suggestions.length > windowSize) {
      scrollInfo = fg(
        irisTheme.scrollInfo,
        ` ${this.selectedIndex + 1}/${this.suggestions.length} `
      );
    }
    output += titledEdge("╭", "╮", inner, scrollInfo, irisTheme.border, 3);

    // 2. Suggestion rows
    const descW = 24;
    const padGap = 2;
    const markerW = 1;
    const iconW = 2;
    const sidePad = 1;
    let titleW = inner - sidePad * 2 - markerW - 1 - iconW;
    if (iconW > 0) titleW--;
    titleW = titleW - padGap - descW;

    const leftBorder = fg(irisTheme.border, "│");
    const rightBorder = fg(irisTheme.border, "│");

    for (let i = start; i < end; i++) {
      const it = this.suggestions[i];
      const selected = i === this.selectedIndex;
      const lineDown = i - start + 2;

      output += gotoMenuLine(lineDown);

      const marker = selected ? bold(fg(irisTheme.accent, "▶")) : " ";
      const iconKey = it.icon || it.cmd.split(/\s+/)[0] || "";
      const iconGlyph = lookupIcon(it.source === "history" ? "history" : iconKey);
      const iconColor = selected ? irisTheme.accent : irisTheme.muted;
      const iconStr = fg(iconColor, fixedWidth(iconGlyph, iconW));

      const title = renderMatchedTitle(it.cmd, query, selected, titleW);

      let descStr = "";
      if (it.source === "history") {
        const badgeText = " history ";
        const tag = selected
          ? bg(irisTheme.historySel, bold(fg(irisTheme.selText, badgeText)))
          : bg(irisTheme.history, fg(irisTheme.historySel, badgeText));
        const rem = Math.max(0, descW - badgeText.length);
        descStr =
          tag +
          (selected
            ? bg(irisTheme.selBg, " ".repeat(rem))
            : " ".repeat(rem));
      } else if (it.source === "system") {
        const badgeText = " system ";
        const tag = selected
          ? bg(irisTheme.sysSel, bold(fg(irisTheme.selText, badgeText)))
          : bg(irisTheme.sys, fg(irisTheme.sysSel, badgeText));
        const rem = Math.max(0, descW - badgeText.length);
        descStr =
          tag +
          (selected
            ? bg(irisTheme.selBg, " ".repeat(rem))
            : " ".repeat(rem));
      } else if (it.source === "alias" || it.source === "legacy") {
        const badgeText = it.source === "legacy" ? " legacy " : " alias ";
        const tag = selected
          ? bg(irisTheme.aliasSel, bold(fg(irisTheme.selText, badgeText)))
          : bg(irisTheme.alias, fg(irisTheme.aliasSel, badgeText));
        const rem = Math.max(0, descW - badgeText.length);
        descStr =
          tag +
          (selected
            ? bg(irisTheme.selBg, " ".repeat(rem))
            : " ".repeat(rem));
      } else {
        const descColor = selected ? irisTheme.descSel : irisTheme.desc;
        descStr = fg(descColor, fixedWidth(it.desc || "", descW));
      }

      const innerContent =
        " " +
        marker +
        " " +
        iconStr +
        " " +
        title +
        " ".repeat(padGap) +
        descStr +
        " ";

      const rowStyled = selected
        ? bg(irisTheme.selBg, innerContent)
        : innerContent;

      output += leftBorder + rowStyled + rightBorder;
    }

    // 3. Bottom border with footer shortcuts
    output += gotoMenuLine(windowSize + 2);

    const footerInfo = ` ${bold(fg(irisTheme.key, "tab"))}${fg(
      irisTheme.scrollInfo,
      " Accept"
    )} • ${bold(fg(irisTheme.key, "ctrl+r"))}${fg(irisTheme.scrollInfo, " Mode")} `;

    const footerW = visualWidth(footerInfo);
    output += titledEdge(
      "╰",
      "╯",
      inner,
      footerInfo,
      irisTheme.border,
      inner - footerW - 2
    );

    if (prevDrawnLines > totalLines) {
      for (let d = totalLines + 1; d <= prevDrawnLines; d++) {
        output += gotoMenuLine(d);
      }
    }

    output += "\x1b8";

    this.lastDrawnLines = totalLines;
    return output;
  }
}
