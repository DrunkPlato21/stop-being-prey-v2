import { getAllArticles } from "./articles";
import { getAllCaseFiles } from "./case-files";
import { getAllFieldNotes } from "./field-notes";
import { getBout, listBouts, type ArenaBout } from "./arena";
import { boutHref, caseNoStr } from "./arena-constants";
import { baseUrl } from "./membership";
import type { CommentKind } from "./comments";

// One place that answers "what is this comment attached to, and where
// does it live?".
//
// It exists because Arena bouts mount the comments sheet as
// `<Comments kind="case-file" slug={bout.id} />` (see
// src/app/arena/[id]/page.tsx). That reuses the case-file storage lane
// but the slug is a bout uuid, not a case-file slug — so every caller
// that resolved a comment by looking only in getAllCaseFiles() missed,
// fell back to the raw slug, and produced a uuid for a title and a
// /case-files/<uuid> link that 404s. The admin feed showed it, and the
// reply-notification email mailed it to members.
//
// Resolution order for a "case-file" comment: the static case files
// first (cheap, and a real case-file slug can never collide with a
// uuid), then the Arena.
//
// KEYSPACE TRAP, on localhost only: comments are stored unprefixed
// (dev shares the live comment keyspace), but the Arena is namespaced
// to `dev:` unless ARENA_KEY_PREFIX="" is set. So on localhost a real
// bout comment finds no bout and falls through to the unresolved
// branch, showing a uuid and a /case-files/<uuid> link — exactly the
// bug this module exists to fix, reproduced by the dev split rather
// than by the code. In production both are unprefixed and it resolves.
// Do not diagnose it from a local render.

export type CommentPiece = {
  /** Human title of the piece. Falls back to the raw slug. */
  title: string;
  /** Eyebrow label: Essay / Case File / Field Note / Bout. */
  label: string;
  /** Site-relative path, anchored at the comment. */
  path: string;
  /** Same path, absolute. For emails. */
  absoluteUrl: string;
};

/** A bout's title as it should read in a list: "Case № 003 · Title". */
function boutTitle(bout: ArenaBout): string {
  return bout.caseNo
    ? `Case № ${caseNoStr(bout.caseNo)} · ${bout.title}`
    : bout.title;
}

function fromBout(bout: ArenaBout, commentId: string): CommentPiece {
  const path = `${boutHref(bout)}#c-${commentId}`;
  return {
    title: boutTitle(bout),
    label: "Bout",
    path,
    absoluteUrl: `${baseUrl()}${path}`,
  };
}

function withAbsolute(
  title: string,
  label: string,
  path: string
): CommentPiece {
  return { title, label, path, absoluteUrl: `${baseUrl()}${path}` };
}

/**
 * Resolve everything that does not need a Redis read. Returns null for
 * a "case-file" comment whose slug is not a known case file — that is
 * the Arena case, and the caller has to supply the bout.
 */
function resolveStatic(
  kind: CommentKind,
  slug: string,
  commentId: string
): CommentPiece | null {
  if (kind === "article") {
    const a = getAllArticles().find((x) => x.slug === slug);
    return withAbsolute(a?.title ?? slug, "Essay", `/${slug}#c-${commentId}`);
  }
  if (kind === "note") {
    const n = getAllFieldNotes().find((x) => x.slug === slug);
    return withAbsolute(
      n?.title ?? slug,
      "Field Note",
      `/notes/field-notes/${slug}#c-${commentId}`
    );
  }
  const c = getAllCaseFiles().find((x) => x.slug === slug);
  if (!c) return null;
  return withAbsolute(
    c.title,
    "Case File",
    `/case-files/${slug}#c-${commentId}`
  );
}

/** Last resort: a case-file slug that is neither a case file nor a
    live bout (a deleted bout, say). Keep the old shape so the row still
    renders something rather than throwing. */
function unresolved(slug: string, commentId: string): CommentPiece {
  return withAbsolute(slug, "Case File", `/case-files/${slug}#c-${commentId}`);
}

/**
 * Resolve one comment's piece. Costs at most one Redis GET, and only
 * for an Arena bout comment.
 */
export async function resolveCommentPiece(
  kind: CommentKind,
  slug: string,
  commentId: string
): Promise<CommentPiece> {
  const staticPiece = resolveStatic(kind, slug, commentId);
  if (staticPiece) return staticPiece;
  const bout = await getBout(slug).catch(() => null);
  return bout ? fromBout(bout, commentId) : unresolved(slug, commentId);
}

/**
 * Batch form for a feed. Fetches the bout index once (only when the
 * batch actually contains an unresolved case-file slug) and returns a
 * synchronous resolver, so a feed of N comments costs one Arena read
 * rather than N.
 */
export async function commentPieceResolver(
  comments: Array<{ kind: CommentKind; slug: string }>
): Promise<(kind: CommentKind, slug: string, commentId: string) => CommentPiece> {
  const needsArena = comments.some(
    (c) => c.kind === "case-file" && !getAllCaseFiles().some((x) => x.slug === c.slug)
  );
  const boutsById = new Map<string, ArenaBout>();
  if (needsArena) {
    // listBouts is capped; take a generous window so an older bout
    // still resolves in the feed. Bout counts are small.
    const bouts = await listBouts(500).catch(() => []);
    for (const b of bouts) boutsById.set(b.id, b);
  }
  return (kind, slug, commentId) => {
    const staticPiece = resolveStatic(kind, slug, commentId);
    if (staticPiece) return staticPiece;
    const bout = boutsById.get(slug);
    return bout ? fromBout(bout, commentId) : unresolved(slug, commentId);
  };
}
