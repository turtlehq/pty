/**
 * Completion projections: affordance lists for human CLI spelling.
 * North star is ADR-0026 manifest rows; v1 consumes legacy `commands --json` shape.
 */

import type { CommandSpec } from "./specs";

/** One affordance in a resource family (CLI "verb" token). */
export type AffordanceDef = {
  id: string;
  label: string;
  description?: string;
};

/** Resource family + affordances (CLI "noun" + verbs). */
export type ResourceFamilyDef = {
  id: string;
  label: string;
  affordances: AffordanceDef[];
  /** alias token → canonical affordance label (e.g. providers → list) */
  aliases?: Record<string, string>;
};

/** Normalized completion projection (manifest compiler target). */
export type LegacyShortcutDef = {
  spelling: string;
  canonical: string;
};

export type CompletionProjection = {
  version: number;
  root: string;
  /** Top-level affordances (no resource family prefix). */
  topLevel: AffordanceDef[];
  resourceFamilies: Record<string, ResourceFamilyDef>;
  legacyShortcuts?: LegacyShortcutDef[];
};

/** Wire format from `tts commands --json` / tsh `catalogJson()`. */
export type LegacyCliProjectionJson = {
  version: number;
  name?: string;
  topLevel?: string[];
  nouns?: Record<
    string,
    {
      verbs: string[];
      aliases?: Record<string, string>;
      verbHelp?: Partial<Record<string, string>>;
    }
  >;
  topLevelAliases?: Record<string, string>;
  legacy?: string[];
};

export function parseLegacyCatalogLine(line: string): LegacyShortcutDef | null {
  const arrow = line.indexOf("→");
  if (arrow === -1) return null;
  const spelling = line.slice(0, arrow).trim();
  let canonical = line.slice(arrow + 1).trim();
  canonical = canonical.replace(/\s*\(deprecated\)\s*$/i, "").trim();
  if (!spelling || !canonical) return null;
  return { spelling, canonical };
}

export function legacyJsonToProjection(
  doc: LegacyCliProjectionJson,
  root = doc.name ?? "cmd"
): CompletionProjection {
  const topLevel: AffordanceDef[] = (doc.topLevel ?? []).map((label) => ({
    id: `${root}.${label}`,
    label,
    description: undefined,
  }));
  if (doc.topLevelAliases) {
    for (const [alias, target] of Object.entries(doc.topLevelAliases)) {
      topLevel.push({
        id: `${root}.${alias}`,
        label: alias,
        description: `→ ${target}`,
      });
    }
  }
  const legacyShortcuts = (doc.legacy ?? [])
    .map(parseLegacyCatalogLine)
    .filter((x): x is LegacyShortcutDef => x !== null);

  const resourceFamilies: Record<string, ResourceFamilyDef> = {};
  for (const [familyId, noun] of Object.entries(doc.nouns ?? {})) {
    resourceFamilies[familyId] = {
      id: familyId,
      label: familyId,
      aliases: noun.aliases,
      affordances: noun.verbs.map((v) => {
        const help = noun.verbHelp?.[v];
        const description = Array.isArray(help) ? help[0] : help;
        return {
          id: `${root}.${familyId}.${v}`,
          label: v,
          description,
        };
      }),
    };
  }

  return {
    version: doc.version,
    root,
    topLevel,
    resourceFamilies,
    legacyShortcuts: legacyShortcuts.length > 0 ? legacyShortcuts : undefined,
  };
}

export function legacyProjectionFromCommandSpec(spec: CommandSpec): CompletionProjection {
  const topLevel: AffordanceDef[] = (spec.subcommands ?? []).map((sub) => ({
    id: `${spec.name}.${sub.name}`,
    label: sub.name,
    description: sub.description,
  }));

  return {
    version: 1,
    root: spec.name,
    topLevel,
    resourceFamilies: {},
  };
}

export type CliAffordanceSuggestion = {
  cmd: string;
  desc: string;
  affordanceId: string;
  source?: "spec" | "system" | "legacy";
};

function matchesPartial(label: string, partial: string): boolean {
  if (!partial) return true;
  return label.toLowerCase().startsWith(partial.toLowerCase());
}

function resolveFamily(
  projection: CompletionProjection,
  token: string
): ResourceFamilyDef | undefined {
  const lower = token.toLowerCase();
  if (projection.resourceFamilies[lower]) {
    return projection.resourceFamilies[lower];
  }
  if (projection.resourceFamilies[token]) {
    return projection.resourceFamilies[token];
  }
  for (const family of Object.values(projection.resourceFamilies)) {
    const aliasTarget = family.aliases?.[lower] ?? family.aliases?.[token];
    if (aliasTarget !== undefined) {
      return family;
    }
    if (family.label.toLowerCase() === lower) return family;
  }
  return undefined;
}

function isFamilyLevelAlias(family: ResourceFamilyDef, alias: string): boolean {
  const fam = family.label.toLowerCase();
  const a = alias.toLowerCase();
  return a.startsWith(fam) && a.length > fam.length;
}

function affordanceLabelsForFamily(family: ResourceFamilyDef): { label: string; desc?: string; id: string }[] {
  const items: { label: string; desc?: string; id: string }[] = [];
  for (const a of family.affordances) {
    items.push({ label: a.label, desc: a.description, id: a.id });
  }
  if (family.aliases) {
    for (const [alias, target] of Object.entries(family.aliases)) {
      if (isFamilyLevelAlias(family, alias)) continue;
      const targetAff = family.affordances.find((a) => a.label === target);
      items.push({
        label: alias,
        desc: targetAff?.description,
        id: targetAff?.id ?? `${family.id}.${alias}`,
      });
    }
  }
  return items;
}

function appendLegacyShortcuts(
  results: CliAffordanceSuggestion[],
  projection: CompletionProjection,
  root: string,
  partial: string
): void {
  for (const leg of projection.legacyShortcuts ?? []) {
    if (matchesPartial(leg.spelling, partial)) {
      results.push({
        cmd: `${root} ${leg.spelling}`,
        desc: `legacy → ${leg.canonical}`,
        affordanceId: `legacy.${leg.spelling}`,
        source: "legacy",
      });
    }
  }
}

/**
 * Suggest full CLI lines from a completion projection and current buffer.
 */
export function suggestCliAffordances(
  query: string,
  projection: CompletionProjection,
  source: "spec" | "system" = "spec"
): CliAffordanceSuggestion[] {
  const trimmed = query.trimStart();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const endsWithSpace = query.endsWith(" ");
  const root = projection.root;
  const partial = endsWithSpace ? "" : tokens[tokens.length - 1] ?? "";
  const results: CliAffordanceSuggestion[] = [];

  if (tokens.length === 0) return results;

  if (tokens.length === 1 && !endsWithSpace) {
    return results;
  }

  // root + space → topLevel + resource family labels
  if (tokens.length === 1 && endsWithSpace) {
    for (const top of projection.topLevel) {
      if (matchesPartial(top.label, partial)) {
        results.push({
          cmd: `${root} ${top.label}`,
          desc: top.description ?? "",
          affordanceId: top.id,
        });
      }
    }
    for (const family of Object.values(projection.resourceFamilies)) {
      if (matchesPartial(family.label, partial)) {
        results.push({
          cmd: `${root} ${family.label}`,
          desc: "Resource family",
          affordanceId: family.id,
        });
      }
      if (family.aliases) {
        for (const alias of Object.keys(family.aliases)) {
          if (matchesPartial(alias, partial)) {
            results.push({
              cmd: `${root} ${alias}`,
              desc: `→ ${family.label}`,
              affordanceId: family.id,
            });
          }
        }
      }
    }
    appendLegacyShortcuts(results, projection, root, partial);
    return results;
  }

  // root family + space → affordances in family
  if (tokens.length === 2 && endsWithSpace) {
    const familyToken = tokens[1];
    const family = resolveFamily(projection, familyToken);
    if (family) {
      for (const item of affordanceLabelsForFamily(family)) {
        if (matchesPartial(item.label, partial)) {
          const desc =
            item.desc && family.aliases?.[item.label]
              ? `${item.desc} (→ ${family.aliases[item.label]})`
              : item.desc ?? "";
          results.push({
            cmd: `${root} ${familyToken} ${item.label}`,
            desc,
            affordanceId: item.id,
          });
        }
      }
    }
    return results;
  }

  // root partialFamily (no trailing space)
  if (tokens.length === 2 && !endsWithSpace) {
    const familyToken = tokens[1];
    const family = resolveFamily(projection, familyToken);
    if (family) {
      for (const item of affordanceLabelsForFamily(family)) {
        if (matchesPartial(item.label, partial)) {
          results.push({
            cmd: `${root} ${familyToken} ${item.label}`,
            desc: item.desc ?? "",
            affordanceId: item.id,
          });
        }
      }
      return results;
    }
    // Typing top-level or family name
    for (const top of projection.topLevel) {
      if (matchesPartial(top.label, partial)) {
        results.push({
          cmd: `${root} ${top.label}`,
          desc: top.description ?? "",
          affordanceId: top.id,
        });
      }
    }
    for (const family of Object.values(projection.resourceFamilies)) {
      if (matchesPartial(family.label, partial)) {
        results.push({
          cmd: `${root} ${family.label}`,
          desc: "Resource family",
          affordanceId: family.id,
        });
      }
      if (family.aliases) {
        for (const alias of Object.keys(family.aliases)) {
          if (matchesPartial(alias, partial)) {
            results.push({
              cmd: `${root} ${alias}`,
              desc: `→ ${family.label}`,
              affordanceId: family.id,
            });
          }
        }
      }
    }
    return results;
  }

  // root family verb-partial (tokens.length === 3, no space)
  if (tokens.length === 3 && !endsWithSpace) {
    const familyToken = tokens[1];
    const family = resolveFamily(projection, familyToken);
    if (family) {
      for (const item of affordanceLabelsForFamily(family)) {
        if (matchesPartial(item.label, partial)) {
          results.push({
            cmd: `${root} ${familyToken} ${item.label}`,
            desc: item.desc ?? "",
            affordanceId: item.id,
          });
        }
      }
    }
  }

  return results;
}

export function cliSuggestionsToOverlay(
  items: CliAffordanceSuggestion[],
  icon: string,
  source: "spec" | "system"
): {
  cmd: string;
  desc: string;
  icon: string;
  source: "spec" | "system" | "legacy";
}[] {
  return items.map((s) => ({
    cmd: s.cmd,
    desc: s.desc,
    icon: s.source === "legacy" ? "alias" : icon,
    source: s.source ?? source,
  }));
}
