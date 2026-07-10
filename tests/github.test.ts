import { getOctokit } from "@actions/github";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../src/github.js";
import type { PullRequestInfo } from "../src/types.js";

vi.mock("@actions/github", () => ({ getOctokit: vi.fn() }));

const pullRequest: PullRequestInfo = {
  owner: "acme",
  repo: "app",
  number: 42,
  title: "feature/auth",
  body: null,
  baseBranch: "main",
  headBranch: "feature/auth",
};

describe("GitHubClient pull request comments", () => {
  const paginate = vi.fn();
  const createComment = vi.fn();
  const updateComment = vi.fn();
  const octokit = {
    paginate,
    rest: {
      issues: {
        listComments: vi.fn(),
        createComment,
        updateComment,
      },
      pulls: {
        listCommits: vi.fn(),
        listFiles: vi.fn(),
        update: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOctokit).mockReturnValue(octokit as never);
  });

  it("creates a pull request issue comment when none exists", async () => {
    paginate.mockResolvedValue([]);
    const client = new GitHubClient("token");

    await expect(
      client.upsertPullRequestComment(
        pullRequest,
        "<!-- prnote-action -->\nSummary",
      ),
    ).resolves.toBe("created");
    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      issue_number: 42,
      body: "<!-- prnote-action -->\nSummary",
    });
    expect(updateComment).not.toHaveBeenCalled();
  });

  it("updates the existing bot comment instead of duplicating it", async () => {
    paginate.mockResolvedValue([
      {
        id: 99,
        body: "<!-- prnote-action -->\nOld summary",
        user: { type: "Bot" },
      },
    ]);
    const client = new GitHubClient("token");

    await expect(
      client.upsertPullRequestComment(
        pullRequest,
        "<!-- prnote-action -->\nNew summary",
      ),
    ).resolves.toBe("updated");
    expect(updateComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      comment_id: 99,
      body: "<!-- prnote-action -->\nNew summary",
    });
    expect(createComment).not.toHaveBeenCalled();
  });
});
