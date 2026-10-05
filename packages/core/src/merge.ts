import { findCollision, surfaceKey } from "./collisions";
import type { Term } from "./model";
import { surfaceForms } from "./termIndex";

export interface MergedTerm {
  term: Term;
  /** Surface forms of the source that were not added because another term already uses them. */
  dropped: string[];
}

/**
 * Merges term `source` into `target` (PLAN.md §4.3): the target keeps its label, scope and case
 * sensitivity, and gains the source's label and aliases as aliases. Forms the target already has
 * are skipped; forms that would collide with one of `others` in the target's scope are dropped.
 * Moving definitions and suppressions is up to the caller.
 */
export function mergeTermInto(
  target: Term,
  source: Term,
  others: readonly Term[],
  now: number,
): MergedTerm {
  const rest = others.filter((t) => t.id !== target.id && t.id !== source.id);
  const keys = new Set(surfaceForms(target).map((s) => surfaceKey(s, target.caseSensitive)));
  const aliases = [...target.aliases];
  const dropped: string[] = [];
  for (const form of surfaceForms(source)) {
    const key = surfaceKey(form, target.caseSensitive);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    const surfaces = {
      label: form,
      aliases: [],
      caseSensitive: target.caseSensitive,
      scope: target.scope,
    };
    if (findCollision(rest, surfaces)) dropped.push(form);
    else aliases.push(form);
  }
  return { term: { ...target, aliases, updatedAt: now }, dropped };
}
