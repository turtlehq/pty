import * as fs from "node:fs";
import { fetchLegacyProjection } from "./catalog";
import { shellAliasStore } from "./shell-aliases";
import {
  cliSuggestionsToOverlay,
  legacyProjectionFromCommandSpec,
  suggestCliAffordances,
  type CompletionProjection,
} from "./completion-projection";

export interface Suggestion {
  cmd: string;
  desc: string;
  icon?: string;
  source: "spec" | "history" | "system" | "alias" | "legacy";
}

export interface CommandSpec {
  name: string;
  description: string;
  subcommands?: { name: string; description: string }[];
  options?: { name: string; description: string }[];
}

export const registry: Record<string, CommandSpec> = {
  // Developer CLI tools
  git: {
    name: "git",
    description: "Fast, scalable, distributed revision control system",
    subcommands: [
      { name: "status", description: "Show working tree status" },
      { name: "commit", description: "Record changes to repository" },
      { name: "checkout", description: "Switch branches or restore files" },
      { name: "switch", description: "Switch branches" },
      { name: "branch", description: "List, create, or delete branches" },
      { name: "push", description: "Update remote refs along with objects" },
      { name: "pull", description: "Fetch and integrate with another repository" },
      { name: "fetch", description: "Download objects and refs from another repo" },
      { name: "diff", description: "Show changes between commits, commit and working tree" },
      { name: "log", description: "Show commit logs" },
      { name: "rebase", description: "Reapply commits on top of another base tip" },
      { name: "stash", description: "Stash changes in a dirty working directory" },
      { name: "merge", description: "Join two or more development histories together" },
      { name: "clone", description: "Clone a repository into a new directory" },
      { name: "add", description: "Add file contents to index" },
      { name: "reset", description: "Reset current HEAD to specified state" },
    ],
    options: [
      { name: "--help", description: "Display help information" },
      { name: "--version", description: "Display git version" },
      { name: "-v", description: "Be verbose" },
      { name: "-C", description: "Run as if git was started in directory" },
    ],
  },
  bun: {
    name: "bun",
    description: "Incredibly fast JavaScript & TypeScript runtime, bundler, and package manager",
    subcommands: [
      { name: "run", description: "Run a script or package binary" },
      { name: "test", description: "Run tests using Bun's built-in runner" },
      { name: "add", description: "Add a dependency to package.json" },
      { name: "remove", description: "Remove a dependency from package.json" },
      { name: "install", description: "Install dependencies from package.json" },
      { name: "build", description: "Bundle TypeScript or JavaScript code" },
      { name: "init", description: "Scaffold a new Bun project" },
      { name: "create", description: "Create a new project from a template" },
      { name: "pm", description: "Package manager utilities and cache commands" },
    ],
    options: [
      { name: "--version", description: "Print Bun version" },
      { name: "--help", description: "Print help information" },
      { name: "--hot", description: "Enable auto-reloading on file change" },
      { name: "--watch", description: "Enable watch mode" },
      { name: "--compile", description: "Compile script into a standalone executable" },
    ],
  },
  cargo: {
    name: "cargo",
    description: "The Rust package manager and build tool",
    subcommands: [
      { name: "build", description: "Compile the current package" },
      { name: "check", description: "Analyze the current package and report errors" },
      { name: "run", description: "Run a binary or example of the local package" },
      { name: "test", description: "Execute unit and integration tests" },
      { name: "clippy", description: "Run linter checks" },
      { name: "fmt", description: "Format code using rustfmt" },
      { name: "add", description: "Add dependencies to Cargo.toml" },
      { name: "update", description: "Update dependencies listed in Cargo.lock" },
    ],
  },
  docker: {
    name: "docker",
    description: "A self-sufficient runtime for containers",
    subcommands: [
      { name: "run", description: "Run a command in a new container" },
      { name: "ps", description: "List active containers" },
      { name: "images", description: "List downloaded container images" },
      { name: "build", description: "Build an image from a Dockerfile" },
      { name: "stop", description: "Stop one or more running containers" },
      { name: "rm", description: "Remove one or more containers" },
      { name: "rmi", description: "Remove one or more images" },
      { name: "exec", description: "Run a command in a running container" },
      { name: "compose", description: "Docker Compose multi-container tool" },
      { name: "logs", description: "Fetch container logs" },
    ],
    options: [
      { name: "--help", description: "Print usage" },
      { name: "--version", description: "Print version" },
    ],
  },
  brew: {
    name: "brew",
    description: "The Missing Package Manager for macOS (or Linux)",
    subcommands: [
      { name: "install", description: "Install a formula or cask" },
      { name: "uninstall", description: "Uninstall a formula or cask" },
      { name: "update", description: "Fetch newest version of Homebrew and formulae" },
      { name: "upgrade", description: "Upgrade outdated formulae and casks" },
      { name: "search", description: "Search for formulae and casks" },
      { name: "info", description: "Display brief information about formula/cask" },
      { name: "list", description: "List installed formulae and casks" },
      { name: "doctor", description: "Check your system for potential problems" },
      { name: "cleanup", description: "Remove stale lock files and outdated downloads" },
    ],
    options: [
      { name: "--version", description: "Print brew version" },
      { name: "--help", description: "Print help message" },
    ],
  },
  pnpm: {
    name: "pnpm",
    description: "Fast, disk space efficient package manager",
    subcommands: [
      { name: "add", description: "Install a package and any packages that it depends on" },
      { name: "install", description: "Install all dependencies for a project" },
      { name: "update", description: "Update packages to their latest version" },
      { name: "remove", description: "Remove package from package.json and node_modules" },
      { name: "run", description: "Run a defined package script" },
      { name: "test", description: "Run tests" },
      { name: "build", description: "Build project" },
      { name: "dev", description: "Run development script" },
    ],
    options: [
      { name: "-D", description: "Save to devDependencies" },
      { name: "-g", description: "Install globally" },
      { name: "--help", description: "Display help" },
    ],
  },
  npm: {
    name: "npm",
    description: "Node package manager",
    subcommands: [
      { name: "install", description: "Install a package" },
      { name: "run", description: "Run arbitrary package scripts" },
      { name: "test", description: "Test a package" },
      { name: "publish", description: "Publish a package" },
      { name: "start", description: "Start a package" },
      { name: "uninstall", description: "Remove a package" },
    ],
    options: [
      { name: "-g", description: "Operate in global mode" },
      { name: "--save-dev", description: "Save to devDependencies" },
    ],
  },
  node: {
    name: "node",
    description: "JavaScript runtime environment",
    options: [
      { name: "--version", description: "Print Node.js version" },
      { name: "--help", description: "Print node command line options" },
      { name: "--watch", description: "Watch input files and restart on changes" },
      { name: "-e", description: "Evaluate inline JavaScript" },
    ],
  },
  python3: {
    name: "python3",
    description: "Python 3 interpreter",
    options: [
      { name: "--version", description: "Print Python version" },
      { name: "--help", description: "Print help message" },
      { name: "-m", description: "Run library module as a script" },
      { name: "-c", description: "Execute program passed in as string" },
    ],
  },
  curl: {
    name: "curl",
    description: "Command line tool for transferring data with URLs",
    options: [
      { name: "-s", description: "Silent mode (don't show progress or errors)" },
      { name: "-v", description: "Make the operation more talkative" },
      { name: "-X", description: "Specify request method (GET, POST, etc.)" },
      { name: "-H", description: "Pass custom header(s) to server" },
      { name: "-d", description: "HTTP POST data" },
      { name: "-o", description: "Write to file instead of stdout" },
      { name: "-O", description: "Write output to a local file named like remote" },
      { name: "-L", description: "Follow HTTP redirects" },
      { name: "--help", description: "Show curl usage help" },
    ],
  },

  // POSIX Filesystem Commands
  ls: {
    name: "ls",
    description: "List directory contents",
    options: [
      { name: "-l", description: "Use long listing format" },
      { name: "-a", description: "Do not ignore entries starting with ." },
      { name: "-la", description: "Long listing format including hidden files" },
      { name: "-lh", description: "Human-readable file sizes" },
      { name: "-R", description: "List subdirectories recursively" },
      { name: "-t", description: "Sort by time, newest first" },
      { name: "-1", description: "List one file per line" },
    ],
  },
  cd: {
    name: "cd",
    description: "Change the shell working directory",
    options: [
      { name: "-", description: "Switch to previous working directory" },
      { name: "..", description: "Switch to parent directory" },
      { name: "~", description: "Switch to home directory" },
    ],
  },
  cat: {
    name: "cat",
    description: "Concatenate and print files",
    options: [
      { name: "-n", description: "Number all output lines" },
      { name: "-b", description: "Number nonempty output lines" },
      { name: "-s", description: "Suppress repeated empty output lines" },
    ],
  },
  cp: {
    name: "cp",
    description: "Copy files and directories",
    options: [
      { name: "-r", description: "Copy directories recursively" },
      { name: "-f", description: "Force copy by removing existing destination files" },
      { name: "-i", description: "Prompt before overwrite" },
      { name: "-p", description: "Preserve file attributes" },
      { name: "-v", description: "Explain what is being done" },
    ],
  },
  mv: {
    name: "mv",
    description: "Move or rename files and directories",
    options: [
      { name: "-f", description: "Do not prompt before overwriting" },
      { name: "-i", description: "Prompt before overwrite" },
      { name: "-n", description: "Do not overwrite an existing file" },
      { name: "-v", description: "Explain what is being done" },
    ],
  },
  rm: {
    name: "rm",
    description: "Remove files or directories",
    options: [
      { name: "-r", description: "Remove directories and their contents recursively" },
      { name: "-rf", description: "Force removal of directories and contents recursively" },
      { name: "-f", description: "Ignore nonexistent files, never prompt" },
      { name: "-i", description: "Prompt before every removal" },
      { name: "-v", description: "Explain what is being done" },
    ],
  },
  mkdir: {
    name: "mkdir",
    description: "Create directories",
    options: [
      { name: "-p", description: "No error if existing, make parent directories as needed" },
      { name: "-v", description: "Print a message for each created directory" },
    ],
  },
  rmdir: {
    name: "rmdir",
    description: "Remove empty directories",
    options: [
      { name: "-p", description: "Remove directory and its ancestors" },
    ],
  },
  touch: {
    name: "touch",
    description: "Change file access and modification times / create empty file",
    options: [
      { name: "-c", description: "Do not create any files" },
      { name: "-a", description: "Change only the access time" },
      { name: "-m", description: "Change only the modification time" },
    ],
  },
  pwd: {
    name: "pwd",
    description: "Print name of current/working directory",
    options: [
      { name: "-L", description: "Print the value of $PWD if it names the current directory" },
      { name: "-P", description: "Print the physical directory, without symbolic links" },
    ],
  },
  chmod: {
    name: "chmod",
    description: "Change file mode bits (permissions)",
    options: [
      { name: "-R", description: "Change files and directories recursively" },
      { name: "+x", description: "Make file executable" },
      { name: "-x", description: "Remove executable permission" },
    ],
  },
  chown: {
    name: "chown",
    description: "Change file owner and group",
    options: [
      { name: "-R", description: "Operate on files and directories recursively" },
      { name: "-v", description: "Output a diagnostic for every file processed" },
    ],
  },
  tar: {
    name: "tar",
    description: "Manipulate tape archives",
    options: [
      { name: "-czvf", description: "Create gzipped tar archive with progress" },
      { name: "-xzvf", description: "Extract gzipped tar archive with progress" },
      { name: "-cf", description: "Create archive" },
      { name: "-xf", description: "Extract archive" },
      { name: "-tf", description: "List archive contents" },
    ],
  },
  zip: {
    name: "zip",
    description: "Package and compress files into zip format",
    options: [
      { name: "-r", description: "Travel directory structure recursively" },
      { name: "-q", description: "Quiet mode" },
    ],
  },
  unzip: {
    name: "unzip",
    description: "List, test and extract compressed files in a ZIP archive",
    options: [
      { name: "-l", description: "List archive files" },
      { name: "-q", description: "Quiet mode" },
      { name: "-d", description: "Extract to directory" },
    ],
  },
  find: {
    name: "find",
    description: "Search for files in a directory hierarchy",
    options: [
      { name: "-name", description: "Base of file name matches pattern" },
      { name: "-type", description: "File is of type (f: file, d: dir, l: symlink)" },
      { name: "-maxdepth", description: "Descend at most levels of directories" },
      { name: "-exec", description: "Execute command on each matched file" },
    ],
  },

  // POSIX Text Processing
  grep: {
    name: "grep",
    description: "Print lines that match patterns",
    options: [
      { name: "-r", description: "Search directories recursively" },
      { name: "-i", description: "Ignore case distinctions" },
      { name: "-n", description: "Prefix each line with 1-based line number" },
      { name: "-v", description: "Invert match (select non-matching lines)" },
      { name: "-E", description: "Extended regular expressions" },
      { name: "-l", description: "Print only names of matching files" },
    ],
  },
  head: {
    name: "head",
    description: "Output the first part of files",
    options: [
      { name: "-n", description: "Print the first N lines" },
      { name: "-c", description: "Print the first N bytes" },
    ],
  },
  tail: {
    name: "tail",
    description: "Output the last part of files",
    options: [
      { name: "-f", description: "Follow appended data as file grows" },
      { name: "-n", description: "Output the last N lines" },
    ],
  },
  sort: {
    name: "sort",
    description: "Sort lines of text files",
    options: [
      { name: "-r", description: "Reverse the result of comparisons" },
      { name: "-n", description: "Compare according to string numerical value" },
      { name: "-u", description: "Output only the first of an equal run (unique)" },
    ],
  },
  uniq: {
    name: "uniq",
    description: "Report or omit repeated lines",
    options: [
      { name: "-c", description: "Prefix lines by the number of occurrences" },
      { name: "-d", description: "Only print duplicate lines" },
      { name: "-u", description: "Only print unique lines" },
    ],
  },
  wc: {
    name: "wc",
    description: "Print newline, word, and byte counts for each file",
    options: [
      { name: "-l", description: "Print the newline counts" },
      { name: "-w", description: "Print the word counts" },
      { name: "-c", description: "Print the byte counts" },
    ],
  },
  diff: {
    name: "diff",
    description: "Compare files line by line",
    options: [
      { name: "-u", description: "Output unified context" },
      { name: "-r", description: "Recursively compare any subdirectories found" },
      { name: "-q", description: "Report only when files differ" },
    ],
  },

  // POSIX System & Process Commands
  ps: {
    name: "ps",
    description: "Report a snapshot of the current processes",
    options: [
      { name: "aux", description: "Show all processes with detailed info" },
      { name: "-ef", description: "Show every process running on system" },
    ],
  },
  kill: {
    name: "kill",
    description: "Send a signal to a process",
    options: [
      { name: "-9", description: "SIGKILL (force immediate termination)" },
      { name: "-15", description: "SIGTERM (graceful termination)" },
      { name: "-l", description: "List signal names" },
    ],
  },
  top: {
    name: "top",
    description: "Display sorted real-time process information",
    options: [
      { name: "-o", description: "Order processes by specified column" },
    ],
  },
  df: {
    name: "df",
    description: "Report file system disk space usage",
    options: [
      { name: "-h", description: "Print sizes in powers of 1024 (human readable)" },
    ],
  },
  du: {
    name: "du",
    description: "Estimate file space usage",
    options: [
      { name: "-sh", description: "Display summary in human readable format" },
      { name: "-d", description: "Depth of directories to descend" },
    ],
  },
  uname: {
    name: "uname",
    description: "Print operating system and kernel information",
    options: [
      { name: "-a", description: "Print all information" },
      { name: "-m", description: "Print machine hardware name" },
      { name: "-r", description: "Print kernel release" },
    ],
  },
  which: {
    name: "which",
    description: "Locate a command executable in PATH",
    options: [
      { name: "-a", description: "Print all matching pathnames" },
    ],
  },
  man: {
    name: "man",
    description: "Format and display manual pages",
  },
  echo: {
    name: "echo",
    description: "Write arguments to the standard output",
    options: [
      { name: "-n", description: "Do not output the trailing newline" },
      { name: "-e", description: "Enable interpretation of backslash escapes" },
    ],
  },
  env: {
    name: "env",
    description: "Set environment and execute command / print environment",
    options: [
      { name: "-i", description: "Start with an empty environment" },
    ],
  },
  sudo: {
    name: "sudo",
    description: "Execute a command as another user or superuser",
    options: [
      { name: "-i", description: "Run login shell as the target user" },
      { name: "-u", description: "Run command as specified user" },
      { name: "-s", description: "Run shell specified by SHELL environment variable" },
    ],
  },
};

let pathBinariesCache: string[] | null = null;

/**
 * Scan PATH for available system binaries on startup.
 */
export function getPathBinaries(): string[] {
  if (pathBinariesCache !== null) return pathBinariesCache;
  const pathDirs = (process.env.PATH || "").split(":").filter(Boolean);
  const set = new Set<string>();

  for (const dir of pathDirs) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (!f.startsWith(".") && !registry[f]) {
          set.add(f);
        }
      }
    } catch {}
  }

  pathBinariesCache = Array.from(set).sort();
  return pathBinariesCache;
}

/**
 * Tokenize input line into command parts.
 */
export function tokenize(line: string): string[] {
  return line.trimStart().split(/\s+/).filter(Boolean);
}

/**
 * Match suggestions from specs and system binaries given the current command line.
 */
export function lookupSpec(query: string): Suggestion[] {
  const trimmed = query.trimStart();
  if (!trimmed) {
    // Show top-level commands
    return Object.values(registry).map((spec) => ({
      cmd: spec.name,
      desc: spec.description,
      icon: spec.name,
      source: "spec",
    }));
  }

  const tokens = tokenize(trimmed);
  const endsWithSpace = query.endsWith(" ");
  const rootName = tokens[0];
  const spec = registry[rootName];

  // If user is typing the initial command name (e.g. "c", "ls", "git", "grep")
  if (tokens.length === 1 && !endsWithSpace) {
    const results: Suggestion[] = [];
    const seen = new Set<string>();

    // 1. Shell aliases (case-sensitive; exact match suppresses PATH noise)
    const aliasMatches = shellAliasStore.search(rootName);
    for (const m of aliasMatches) {
      results.push(m);
      seen.add(m.cmd);
    }

    // 2. Matches from spec registry
    const specMatches = Object.values(registry)
      .filter((s) => s.name.startsWith(rootName))
      .map((s) => ({
        cmd: s.name,
        desc: s.description,
        icon: s.name,
        source: "spec" as const,
      }));
    for (const m of specMatches) {
      results.push(m);
      seen.add(m.cmd);
    }

    // 3. Matches from PATH system binaries (skip when exact alias owns the token)
    const systemBinaries = getPathBinaries();
    const suppressPath = shellAliasStore.hasExact(rootName);
    const systemMatches = suppressPath
      ? []
      : systemBinaries
      .filter((bin) => bin.startsWith(rootName) && !seen.has(bin))
      .slice(0, 15)
      .map((bin) => ({
        cmd: bin,
        desc: "System command",
        icon: bin,
        source: "system" as const,
      }));
    results.push(...systemMatches);

    // Exact root token (e.g. `git`, `tts`) → show affordances without trailing space.
    if (trimmed === rootName) {
      const exactSpec = registry[rootName];
      const projection = exactSpec
        ? legacyProjectionFromCommandSpec(exactSpec)
        : fetchLegacyProjection(rootName);
      if (projection) {
        const nested = cliSuggestionsToOverlay(
          suggestCliAffordances(`${rootName} `, projection, exactSpec ? "spec" : "system"),
          rootName,
          exactSpec ? "spec" : "system"
        );
        if (nested.length > 0) {
          return nested;
        }
      }
      if (exactSpec?.options?.length) {
        return exactSpec.options.map((opt) => ({
          cmd: `${rootName} ${opt.name}`,
          desc: opt.description,
          icon: rootName,
          source: "spec" as const,
        }));
      }
    }

    return results;
  }

  const projection: CompletionProjection | null = spec
    ? legacyProjectionFromCommandSpec(spec)
    : fetchLegacyProjection(rootName);

  if (!projection) {
    return [];
  }

  const source: "spec" | "system" = spec ? "spec" : "system";
  const suggestions: Suggestion[] = cliSuggestionsToOverlay(
    suggestCliAffordances(query, projection, source),
    rootName,
    source
  );

  const partial = endsWithSpace ? "" : tokens[tokens.length - 1];

  // Registry-only flags (not in legacy JSON projection v1)
  if (spec?.options) {
    const prefixTokens = endsWithSpace ? tokens : tokens.slice(0, -1);
    const prefix = prefixTokens.join(" ");
    const hasSubcommandAffordances =
      projection.topLevel.length > 0 ||
      Object.keys(projection.resourceFamilies).length > 0;

    for (const opt of spec.options) {
      const match =
        !partial ||
        opt.name.startsWith(partial) ||
        (partial.startsWith("-") && opt.name.startsWith(partial));

      if (match) {
        if (hasSubcommandAffordances && !partial && suggestions.length > 0) {
          continue;
        }
        suggestions.push({
          cmd: prefix ? `${prefix} ${opt.name}` : `${rootName} ${opt.name}`,
          desc: opt.description,
          icon: rootName,
          source: "spec",
        });
      }
    }
  }

  return suggestions;
}
