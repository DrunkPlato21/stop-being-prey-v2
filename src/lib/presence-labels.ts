import { getBoutByParam } from "./arena";
import { caseNoStr } from "./arena-constants";
import { getThread } from "./guild";
import type { PresenceEntry } from "./presence";

// Turn id-shaped paths into names for the admin presence panel.
//
// The panel showed the raw pathname, which is fine for /lounge and
// useless for the two rooms whose URLs carry an id:
//
//   /arena/0ea9781e-c6c8-46ef-b6d5-…     which fight?
//   /guild/f8161075-4724-41ba-aca4-…     which thread?
//
// An Arena bout only mints its readable slug when it seals, so an OPEN
// bout genuinely has no better URL — this is not a bug in the room, and
// the panel is the right place to fix it. Guild threads never had one.
//
// Kept out of presence.ts so that module stays free of the Arena and
// Guild stores: presence is imported by the admin pages AND the ping
// route, and neither should drag two more keyspaces in behind it.

/** Distinct lookups per snapshot, so ten people in one bout cost one read. */
type Cache = Map<string, string | null>;

function firstSegmentAfter(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest) return null;
  const seg = rest.split(/[/?#]/)[0];
  return seg && seg.length > 0 ? seg : null;
}

async function arenaLabel(param: string, cache: Cache): Promise<string | null> {
  const key = `arena:${param}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const bout = await getBoutByParam(param).catch(() => null);
  // The case number is what Clay calls a filed case, so it leads when
  // there is one. An open bout has no number yet and reads as its title.
  const label = bout
    ? bout.caseNo != null
      ? `Case ${caseNoStr(bout.caseNo)} · ${bout.title}`
      : bout.title
    : null;
  cache.set(key, label);
  return label;
}

async function guildLabel(id: string, cache: Cache): Promise<string | null> {
  const key = `guild:${id}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const thread = await getThread(id).catch(() => null);
  const label = thread?.title?.trim() || null;
  cache.set(key, label);
  return label;
}

/** The rooms whose sub-pages are indexes, not things with names. */
const ARENA_RESERVED = new Set(["arsenal", "unsubscribe"]);

async function labelForPath(
  path: string,
  cache: Cache
): Promise<string | null> {
  const boutParam = firstSegmentAfter(path, "/arena/");
  if (boutParam && !ARENA_RESERVED.has(boutParam)) {
    return arenaLabel(boutParam, cache);
  }
  const threadId = firstSegmentAfter(path, "/guild/");
  if (threadId) return guildLabel(threadId, cache);
  return null;
}

/**
 * Decorate a presence snapshot with human names where the path has one.
 *
 * Best-effort by design: a deleted bout, an unreachable store or a path
 * that resolves to nothing simply keeps its raw path, which is still
 * true and still clickable. The panel must never fail to render because
 * a name could not be found.
 */
export async function describePresence(
  entries: PresenceEntry[]
): Promise<PresenceEntry[]> {
  if (entries.length === 0) return entries;
  const cache: Cache = new Map();
  const out: PresenceEntry[] = [];
  for (const entry of entries) {
    const label = await labelForPath(entry.path, cache).catch(() => null);
    out.push(label ? { ...entry, label } : entry);
  }
  return out;
}
