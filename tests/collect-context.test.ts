import { describe, expect, it } from "vitest";
import {
  collectContext,
  normalizeCommitMessage,
} from "../src/collect-context.js";
import type { PullRequestData } from "../src/types.js";

const data: PullRequestData = {
  pullRequest: {
    owner: "acme",
    repo: "app",
    number: 12,
    title: "feature/auth",
    body: null,
    baseBranch: "main",
    headBranch: "feature/auth",
  },
  commits: [
    { sha: "1", message: "Add auth route\r\n\r\nSupports magic links   " },
    { sha: "2", message: "   " },
  ],
  files: [
    {
      filename: "package-lock.json",
      status: "modified",
      additions: 50,
      deletions: 40,
      changes: 90,
      patch: "lockfile noise",
    },
    {
      filename: "src/auth.ts",
      status: "added",
      additions: 20,
      deletions: 0,
      changes: 20,
      patch: "+export function authenticate() {}",
    },
    {
      filename: "tests/auth.test.ts",
      status: "added",
      additions: 10,
      deletions: 0,
      changes: 10,
      patch: "+it('authenticates', () => {})",
    },
    {
      filename: "assets/logo.png",
      status: "added",
      additions: 0,
      deletions: 0,
      changes: 0,
    },
  ],
};

describe("normalizeCommitMessage", () => {
  it("normalizes line endings and trailing whitespace", () => {
    expect(normalizeCommitMessage("Subject\r\n\r\nBody   ")).toBe(
      "Subject\n\nBody",
    );
  });
});

describe("collectContext", () => {
  it("excludes generated files, ignores blank commits, and retains total stats", () => {
    const context = collectContext(data, {
      exclude: ["package-lock.json"],
      maxDiffCharacters: 1000,
    });

    expect(context.commits).toEqual(["Add auth route\n\nSupports magic links"]);
    expect(context.files.map((file) => file.filename)).toEqual([
      "src/auth.ts",
      "tests/auth.test.ts",
      "assets/logo.png",
    ]);
    expect(context.diffExcerpts[0]?.filename).toBe("src/auth.ts");
    expect(context.totals).toEqual({ additions: 80, deletions: 40, files: 4 });
    expect(context.truncated).toBe(true);
  });

  it("prioritizes source changes and respects the exact diff budget", () => {
    const context = collectContext(data, {
      exclude: [],
      maxDiffCharacters: 12,
    });
    expect(context.diffExcerpts).toEqual([
      { filename: "src/auth.ts", patch: "+export func" },
    ]);
    expect(context.truncated).toBe(true);
  });

  it("supports glob exclusions and a zero-character context mode", () => {
    const context = collectContext(data, {
      exclude: ["**/*.test.ts", "*.json"],
      maxDiffCharacters: 0,
    });
    expect(context.files.map((file) => file.filename)).toEqual([
      "src/auth.ts",
      "assets/logo.png",
    ]);
    expect(context.diffExcerpts).toEqual([]);
  });
});
