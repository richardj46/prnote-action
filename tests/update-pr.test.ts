import { describe, expect, it } from "vitest";
import {
  decideUpdate,
  eligibleFields,
  isEffectivelyEmptyBody,
  isWeakTitle,
} from "../src/update-pr.js";
import type { GeneratedNote, PullRequestInfo } from "../src/types.js";

describe("isWeakTitle", () => {
  it.each([
    ["", "feature/auth"],
    ["update", "feature/auth"],
    ["feature/auth", "feature/auth"],
    ["Feature auth", "feature/auth"],
    ["payment-update", "richard/payment-update"],
    ["new-feature", "new-feature"],
  ])("recognizes weak title %j", (title, branch) => {
    expect(isWeakTitle(title, branch)).toBe(true);
  });

  it.each([
    "Add passwordless authentication with email verification",
    "Prevent duplicate Stripe webhook processing",
    "PROJ-123 Add validation for imported invoices",
    "fix(auth): reject expired magic links",
  ])("preserves meaningful title %j", (title) => {
    expect(isWeakTitle(title, "feature/auth")).toBe(false);
  });
});

describe("isEffectivelyEmptyBody", () => {
  it.each([
    null,
    "",
    "<!-- Describe your changes here -->",
    "## Description\n\n<!-- Describe your changes here -->\n\n## Testing",
    "## Checklist\n\n- [ ] Add tests\n- [ ] Update docs",
  ])("treats templates as empty", (body) => {
    expect(isEffectivelyEmptyBody(body)).toBe(true);
  });

  it.each([
    "## Description\n\nAdds an authentication endpoint.",
    "![screenshot](https://example.com/image.png)",
    '<img src="https://example.com/image.png">',
    "## Checklist\n\n- [x] Added tests",
    "Fixes #123 with a guarded retry.",
  ])("preserves substantive body", (body) => {
    expect(isEffectivelyEmptyBody(body)).toBe(false);
  });
});

describe("decideUpdate", () => {
  const pullRequest: PullRequestInfo = {
    owner: "acme",
    repo: "app",
    number: 1,
    title: "feature/auth",
    body: "## Description\n\n<!-- Describe your changes here -->",
    baseBranch: "main",
    headBranch: "feature/auth",
  };
  const note: GeneratedNote = {
    title: "Add authentication",
    summary: "Adds sign-in.",
    changes: ["Add a route"],
    testing: [],
    notes: [],
  };

  it("updates weak content", () => {
    expect(
      decideUpdate(pullRequest, note, {
        updateTitle: true,
        updateBody: true,
        overwriteTitle: false,
        overwriteBody: false,
      }),
    ).toMatchObject({
      title: "Add authentication",
      body: expect.stringContaining("## Summary"),
      titleUpdated: true,
      bodyUpdated: true,
    });
  });

  it("preserves meaningful human content", () => {
    const decision = decideUpdate(
      {
        ...pullRequest,
        title: "Add authentication with magic links",
        body: "Explains the rollout plan in detail.",
      },
      note,
      {
        updateTitle: true,
        updateBody: true,
        overwriteTitle: false,
        overwriteBody: false,
      },
    );
    expect(decision).toEqual({ titleUpdated: false, bodyUpdated: false });
  });

  it("honors overwrite and per-field controls", () => {
    const decision = decideUpdate(
      {
        ...pullRequest,
        title: "A meaningful title",
        body: "A meaningful body.",
      },
      note,
      {
        updateTitle: false,
        updateBody: true,
        overwriteTitle: true,
        overwriteBody: true,
      },
    );
    expect(decision.titleUpdated).toBe(false);
    expect(decision.bodyUpdated).toBe(true);
  });

  it("can determine eligibility before any generation request", () => {
    expect(
      eligibleFields(
        {
          ...pullRequest,
          title: "A meaningful title",
          body: "A meaningful explanation.",
        },
        {
          updateTitle: true,
          updateBody: true,
          overwriteTitle: false,
          overwriteBody: false,
        },
      ),
    ).toEqual({ title: false, body: false });
  });
});
