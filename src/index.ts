import * as core from "@actions/core";
import * as github from "@actions/github";
import { collectContext } from "./collect-context.js";
import { readConfig } from "./config.js";
import { generateNote } from "./generate-note.js";
import { GitHubClient } from "./github.js";
import type { PullRequestInfo } from "./types.js";
import { decideUpdate, eligibleFields } from "./update-pr.js";

function eventPullRequest(): PullRequestInfo | null {
  const payload = github.context.payload;
  if (github.context.eventName !== "pull_request" || !payload.pull_request)
    return null;
  const action = payload.action;
  if (action !== "opened") return null;

  return {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    number: payload.pull_request.number,
    title: payload.pull_request.title,
    body: payload.pull_request.body ?? null,
    baseBranch: payload.pull_request.base.ref,
    headBranch: payload.pull_request.head.ref,
  };
}

export async function run(): Promise<void> {
  try {
    const pullRequest = eventPullRequest();
    if (!pullRequest) {
      core.warning(
        "PRNote runs only for the pull_request.opened event; no changes were made.",
      );
      core.setOutput("title-updated", false);
      core.setOutput("body-updated", false);
      return;
    }

    const config = readConfig();
    const eligible = eligibleFields(pullRequest, config);
    if (!eligible.title && !eligible.body) {
      core.info(
        "The pull request already contains meaningful content; no context was sent for generation.",
      );
      core.setOutput("title-updated", false);
      core.setOutput("body-updated", false);
      return;
    }
    const client = new GitHubClient(config.githubToken);
    core.info(`Collecting context for pull request #${pullRequest.number}.`);
    const data = await client.collectPullRequest(pullRequest);
    const context = collectContext(data, config);
    core.info(
      `Collected ${context.commits.length} commits, ${context.files.length} included files, and ${context.diffExcerpts.reduce((sum, excerpt) => sum + excerpt.patch.length, 0)} diff characters.`,
    );

    const note = await generateNote(context, config);
    const decision = decideUpdate(pullRequest, note, config);
    if (!decision.titleUpdated && !decision.bodyUpdated) {
      core.info(
        "The pull request already contains meaningful content; no changes were made.",
      );
    } else {
      const {
        titleUpdated: _titleUpdated,
        bodyUpdated: _bodyUpdated,
        ...update
      } = decision;
      await client.updatePullRequest(pullRequest, update);
      core.info(
        `Updated pull request ${[
          decision.titleUpdated ? "title" : null,
          decision.bodyUpdated ? "body" : null,
        ]
          .filter(Boolean)
          .join(" and ")}.`,
      );
    }
    core.setOutput("title-updated", decision.titleUpdated);
    core.setOutput("body-updated", decision.bodyUpdated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(
      `PRNote could not generate a pull request description. The existing pull request was left unchanged. ${message}`,
    );
    core.setOutput("title-updated", false);
    core.setOutput("body-updated", false);
  }
}

void run();
