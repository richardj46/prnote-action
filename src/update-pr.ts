import type {
  ActionConfig,
  GeneratedNote,
  PullRequestInfo,
  UpdateDecision,
} from "./types.js";
import { renderNote } from "./generate-note.js";

const TITLE_PLACEHOLDERS = new Set([
  "changes",
  "fix",
  "misc",
  "new feature",
  "new-feature",
  "pr",
  "pull request",
  "todo",
  "tbd",
  "update",
  "updates",
  "wip",
]);

function normalizedTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^refs\/heads\//, "")
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWeakTitle(title: string, headBranch: string): boolean {
  const raw = title.trim();
  if (!raw) return true;
  const normalized = normalizedTitle(raw);
  const branch = normalizedTitle(headBranch);
  if (
    TITLE_PLACEHOLDERS.has(raw.toLowerCase()) ||
    TITLE_PLACEHOLDERS.has(normalized)
  ) {
    return true;
  }
  if (normalized === branch) return true;

  const branchWithoutOwner = normalizedTitle(
    headBranch.split("/").slice(1).join("/"),
  );
  if (branchWithoutOwner && normalized === branchWithoutOwner) return true;

  // GitHub often formats branch names into a capitalized default title.
  const titleTokens = normalized.split(" ");
  const branchTokens = branch.split(" ");
  if (
    titleTokens.length >= 2 &&
    titleTokens.length <= 7 &&
    titleTokens.join(" ") === branchTokens.slice(-titleTokens.length).join(" ")
  ) {
    return true;
  }
  return false;
}

function stripTemplateMarkup(body: string): string {
  return body
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/^\s*#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*[-*+]\s*\[\s\]\s*.*$/gm, " ")
    .replace(
      /^\s*[-*+]\s*(describe|explain|add|replace|delete|select|check|please)\b.*$/gim,
      " ",
    )
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/[\s:_*`>-]+/g, " ")
    .trim();
}

export function isEffectivelyEmptyBody(body: string | null): boolean {
  if (!body?.trim()) return true;
  if (/!\[[^\]]*\]\([^)]+\)|<img\b/i.test(body)) return false;
  if (/^\s*[-*+]\s*\[[xX]\]/m.test(body)) return false;
  return stripTemplateMarkup(body).length < 12;
}

export function eligibleFields(
  pullRequest: PullRequestInfo,
  config: Pick<
    ActionConfig,
    "updateTitle" | "updateBody" | "overwriteTitle" | "overwriteBody"
  >,
): { title: boolean; body: boolean } {
  return {
    title:
      config.updateTitle &&
      (config.overwriteTitle ||
        isWeakTitle(pullRequest.title, pullRequest.headBranch)),
    body:
      config.updateBody &&
      (config.overwriteBody || isEffectivelyEmptyBody(pullRequest.body)),
  };
}

export function renderPullRequestComment(note: GeneratedNote): string {
  const commentNote: GeneratedNote = {
    ...note,
    changes:
      note.commitMessages && note.commitMessages.length > 0
        ? note.commitMessages
        : note.changes,
    commitMessages: [],
  };
  return [
    "<!-- prnote-action -->",
    "## PRNote",
    `**Suggested title:** ${note.title}`,
    renderNote(commentNote),
    "_This is a pull request conversation comment. PRNote does not merge the pull request or modify commits._",
  ].join("\n\n");
}

export function decideUpdate(
  pullRequest: PullRequestInfo,
  note: GeneratedNote,
  config: Pick<
    ActionConfig,
    "updateTitle" | "updateBody" | "overwriteTitle" | "overwriteBody"
  >,
): UpdateDecision {
  const eligible = eligibleFields(pullRequest, config);

  return {
    ...(eligible.title ? { title: note.title } : {}),
    ...(eligible.body ? { body: renderNote(note) } : {}),
    titleUpdated: eligible.title,
    bodyUpdated: eligible.body,
  };
}
