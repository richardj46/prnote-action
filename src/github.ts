import { getOctokit } from "@actions/github";
import type {
  ChangedFile,
  CommitInfo,
  PullRequestData,
  PullRequestInfo,
} from "./types.js";

type Octokit = ReturnType<typeof getOctokit>;

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = getOctokit(token);
  }

  async collectPullRequest(
    pullRequest: PullRequestInfo,
  ): Promise<PullRequestData> {
    const request = {
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      pull_number: pullRequest.number,
      per_page: 100,
    };

    const [commitResponses, fileResponses] = await Promise.all([
      this.octokit.paginate(this.octokit.rest.pulls.listCommits, request),
      this.octokit.paginate(this.octokit.rest.pulls.listFiles, request),
    ]);

    const commits: CommitInfo[] = commitResponses.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
    }));
    const files: ChangedFile[] = fileResponses.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      ...(file.patch === undefined ? {} : { patch: file.patch }),
    }));

    return { pullRequest, commits, files };
  }

  async updatePullRequest(
    pullRequest: PullRequestInfo,
    update: { title?: string; body?: string },
  ): Promise<void> {
    await this.octokit.rest.pulls.update({
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      pull_number: pullRequest.number,
      ...update,
    });
  }

  async upsertPullRequestComment(
    pullRequest: PullRequestInfo,
    body: string,
  ): Promise<"created" | "updated"> {
    const comments = await this.octokit.paginate(
      this.octokit.rest.issues.listComments,
      {
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        issue_number: pullRequest.number,
        per_page: 100,
      },
    );
    const existing = comments.find(
      (comment) =>
        comment.user?.type === "Bot" &&
        comment.body?.includes("<!-- prnote-action -->"),
    );

    if (existing) {
      await this.octokit.rest.issues.updateComment({
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        comment_id: existing.id,
        body,
      });
      return "updated";
    }

    await this.octokit.rest.issues.createComment({
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      issue_number: pullRequest.number,
      body,
    });
    return "created";
  }
}
