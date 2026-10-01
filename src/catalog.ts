import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CompletionProjection,
  type LegacyCliProjectionJson,
  legacyJsonToProjection,
} from "./completion-projection";

export function projectionFromLegacyJson(
  doc: LegacyCliProjectionJson,
  root?: string
): CompletionProjection {
  return legacyJsonToProjection(doc, root ?? doc.name ?? "cmd");
}

export function projectionFromJsonString(json: string, root?: string): CompletionProjection {
  const doc = JSON.parse(json) as LegacyCliProjectionJson;
  return projectionFromLegacyJson(doc, root);
}

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  projection: CompletionProjection;
  fetchedAt: number;
  resolvedPath: string;
};

const projectionCache = new Map<string, CacheEntry>();

export function clearProjectionCache(): void {
  projectionCache.clear();
}

function resolveBinaryOnPath(name: string): string | null {
  const pathDirs = (process.env.PATH || "").split(":").filter(Boolean);
  for (const dir of pathDirs) {
    const full = path.join(dir, name);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      continue;
    }
  }
  return null;
}

function parseCommandsJson(stdout: string, root: string): CompletionProjection | null {
  try {
    const doc = JSON.parse(stdout) as LegacyCliProjectionJson;
    if (typeof doc.version !== "number") return null;
    return legacyJsonToProjection(doc, doc.name ?? root);
  } catch {
    return null;
  }
}

/**
 * Load completion projection via `binary commands --json` (sync, cached).
 */
export function fetchLegacyProjection(binaryName: string): CompletionProjection | null {
  const resolved = resolveBinaryOnPath(binaryName);
  if (!resolved) return null;

  const cached = projectionCache.get(resolved);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.projection;
  }

  const result = spawnSync(resolved, ["commands", "--json"], {
    encoding: "utf8",
    timeout: 5000,
    env: process.env,
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  const projection = parseCommandsJson(result.stdout, binaryName);
  if (!projection) return null;

  projectionCache.set(resolved, {
    projection,
    fetchedAt: Date.now(),
    resolvedPath: resolved,
  });

  return projection;
}

export function getCachedProjection(binaryName: string): CompletionProjection | null {
  const resolved = resolveBinaryOnPath(binaryName);
  if (!resolved) return null;
  const cached = projectionCache.get(resolved);
  if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) return null;
  return cached.projection;
}
