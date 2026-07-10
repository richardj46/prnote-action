import { minimatch } from "minimatch";
import type {
  ActionConfig,
  ChangedFile,
  GenerationContext,
  PullRequestData,
} from "./types.js";

const SOURCE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "swift",
  "ts",
  "tsx",
  "vue",
]);

function isExcluded(filename: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(filename, pattern, {
      dot: true,
      matchBase: !pattern.includes("/"),
    }),
  );
}

function filePriority(file: ChangedFile): number {
  const lower = file.filename.toLowerCase();
  const extension = lower.split(".").pop() ?? "";
  if (/^(migrations?|db\/migrate)\//.test(lower)) return 1;
  if (SOURCE_EXTENSIONS.has(extension) && !/test|spec|__tests__/.test(lower))
    return 0;
  if (/test|spec|__tests__/.test(lower)) return 2;
  if (/openapi|swagger|schema|api/.test(lower)) return 1;
  if (/\.ya?ml$|\.json$|\.toml$|\.ini$|\.env/.test(lower)) return 3;
  if (/\.md$|docs?\//.test(lower)) return 4;
  return 3;
}

export function normalizeCommitMessage(message: string): string {
  return message
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function collectContext(
  data: PullRequestData,
  config: Pick<ActionConfig, "exclude" | "maxDiffCharacters">,
): GenerationContext {
  const includedFiles = data.files.filter(
    (file) => !isExcluded(file.filename, config.exclude),
  );
  const prioritized = [...includedFiles].sort(
    (left, right) =>
      filePriority(left) - filePriority(right) || right.changes - left.changes,
  );

  let remaining = config.maxDiffCharacters;
  let truncated = includedFiles.length !== data.files.length;
  const diffExcerpts: Array<{ filename: string; patch: string }> = [];

  for (const file of prioritized) {
    if (!file.patch) continue;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const patch = file.patch.slice(0, remaining);
    diffExcerpts.push({ filename: file.filename, patch });
    remaining -= patch.length;
    if (patch.length < file.patch.length) {
      truncated = true;
      break;
    }
  }

  return {
    currentTitle: data.pullRequest.title,
    currentBody: data.pullRequest.body,
    baseBranch: data.pullRequest.baseBranch,
    headBranch: data.pullRequest.headBranch,
    commits: data.commits
      .map((commit) => normalizeCommitMessage(commit.message))
      .filter(Boolean),
    files: includedFiles.map(({ patch: _patch, ...file }) => file),
    diffExcerpts,
    totals: data.files.reduce(
      (totals, file) => ({
        additions: totals.additions + file.additions,
        deletions: totals.deletions + file.deletions,
        files: totals.files + 1,
      }),
      { additions: 0, deletions: 0, files: 0 },
    ),
    truncated,
  };
}
