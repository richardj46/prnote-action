import * as core from "@actions/core";
import * as github from "@actions/github";
import { collectContext } from "./collect-context.js";
import { readConfig } from "./config.js";
import {
  applyPullRequestTitleConvention,
  attachCommitMessages,
  generateFallbackNote,
  generateNote,
} from "./generate-note.js";
import { GitHubClient } from "./github.js";
import type { GeneratedNote, PullRequestInfo } from "./types.js";
import {
  decideUpdate,
  eligibleFields,
  renderPullRequestComment,
} from "./update-pr.js";

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
      core.setOutput("comment-written", false);
      return;
    }

    const config = readConfig();
    const eligible = eligibleFields(pullRequest, config);
    if (!eligible.title && !eligible.body && !config.comment) {
      core.info(
        "The pull request already contains meaningful content; no context was sent for generation.",
      );
      core.setOutput("title-updated", false);
      core.setOutput("body-updated", false);
      core.setOutput("comment-written", false);
      return;
    }
    const client = new GitHubClient(config.githubToken);
    core.info(`Collecting context for pull request #${pullRequest.number}.`);
    const data = await client.collectPullRequest(pullRequest);
    const context = collectContext(data, config);
    core.info(
      `Collected ${context.commits.length} commits, ${context.files.length} included files, and ${context.diffExcerpts.reduce((sum, excerpt) => sum + excerpt.patch.length, 0)} diff characters.`,
    );

    let note: GeneratedNote;
    if (!config.apiKey) {
      core.warning(
        "No Gemini API key was provided. Generating the pull request note from commit history.",
      );
      note = generateFallbackNote(context);
    } else {
      try {
        note = await generateNote(context, config);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(
          `Gemini generation was unavailable (${message}). Falling back to commit-history generation.`,
        );
        note = generateFallbackNote(context);
      }
    }
    note = applyPullRequestTitleConvention(
      attachCommitMessages(note, context.commits),
      pullRequest.headBranch,
    );
    const decision = decideUpdate(pullRequest, note, config);
    let titleUpdated = false;
    let bodyUpdated = false;
    if (!decision.titleUpdated && !decision.bodyUpdated) {
      core.info("The pull request title and body were preserved.");
    } else {
      const {
        titleUpdated: _titleUpdated,
        bodyUpdated: _bodyUpdated,
        ...update
      } = decision;
      try {
        await client.updatePullRequest(pullRequest, update);
        titleUpdated = decision.titleUpdated;
        bodyUpdated = decision.bodyUpdated;
        core.info(
          `Updated pull request ${[
            titleUpdated ? "title" : null,
            bodyUpdated ? "body" : null,
          ]
            .filter(Boolean)
            .join(" and ")}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(
          `PRNote could not update the pull request title or body: ${message}`,
        );
      }
    }
    let commentWritten = false;
    if (config.comment) {
      try {
        const commentResult = await client.upsertPullRequestComment(
          pullRequest,
          renderPullRequestComment(note),
        );
        commentWritten = true;
        core.info(
          `${commentResult === "created" ? "Created" : "Updated"} the PRNote pull request comment.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(
          `PRNote could not write its pull request comment: ${message}`,
        );
      }
    }
    core.setOutput("title-updated", titleUpdated);
    core.setOutput("body-updated", bodyUpdated);
    core.setOutput("comment-written", commentWritten);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(
      `PRNote could not generate a pull request description. The existing pull request was left unchanged. ${message}`,
    );
    core.setOutput("title-updated", false);
    core.setOutput("body-updated", false);
    core.setOutput("comment-written", false);
  }
}

void run();
