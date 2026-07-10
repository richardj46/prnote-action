import { describe, expect, it, vi } from "vitest";
import {
  buildPrompt,
  generateFallbackNote,
  generateNote,
  renderNote,
  validateGeneratedNote,
} from "../src/generate-note.js";
import type { GenerationContext } from "../src/types.js";

const context: GenerationContext = {
  currentTitle: "feature/auth",
  currentBody: null,
  baseBranch: "main",
  headBranch: "feature/auth",
  commits: ["Add authentication"],
  files: [],
  diffExcerpts: [],
  totals: { additions: 5, deletions: 0, files: 1 },
  truncated: false,
};

describe("generated note validation", () => {
  it("validates and normalizes structured output", () => {
    expect(
      validateGeneratedNote({
        title: "  Add   authentication ",
        summary: " Adds sign-in. ",
        changes: [" Add route ", ""],
        testing: [],
        notes: [],
      }),
    ).toEqual({
      title: "Add authentication",
      summary: "Adds sign-in.",
      changes: ["Add route"],
      testing: [],
      notes: [],
    });
  });

  it.each([
    [{ summary: "x", changes: [], testing: [], notes: [] }, "title"],
    [
      {
        title: "x".repeat(121),
        summary: "x",
        changes: [],
        testing: [],
        notes: [],
      },
      "120",
    ],
    [
      { title: "x", summary: "", changes: [], testing: [], notes: [] },
      "summary",
    ],
    [
      { title: "x", summary: "x", changes: "no", testing: [], notes: [] },
      "changes",
    ],
  ])("rejects invalid output", (value, expected) => {
    expect(() => validateGeneratedNote(value)).toThrow(expected);
  });

  it("renders only populated Markdown sections", () => {
    expect(
      renderNote({
        title: "Add authentication",
        summary: "Adds sign-in.",
        changes: ["Add a sign-in route"],
        testing: [],
        notes: ["Requires EMAIL_FROM"],
      }),
    ).toBe(
      "## Summary\n\nAdds sign-in.\n\n## Changes\n\n- Add a sign-in route\n\n## Notes\n\n- Requires EMAIL_FROM",
    );
  });
});

describe("commit-history fallback", () => {
  it("builds a title and description without model output", () => {
    const note = generateFallbackNote({
      ...context,
      commits: [
        "feat(auth): add passwordless sign-in\n\nAdd verification links",
        "test: cover expired verification links",
        "Merge branch 'main' into feature/auth",
      ],
      files: [
        {
          filename: "src/auth.ts",
          status: "modified",
          additions: 20,
          deletions: 3,
          changes: 23,
        },
        {
          filename: "tests/auth.test.ts",
          status: "modified",
          additions: 10,
          deletions: 0,
          changes: 10,
        },
      ],
      totals: { additions: 30, deletions: 3, files: 2 },
      truncated: true,
    });

    expect(note).toEqual({
      title: "Add passwordless sign-in",
      summary: "Contains 3 commits affecting 2 files (+30/-3).",
      changes: ["add passwordless sign-in", "cover expired verification links"],
      testing: [
        "Test-related changes were found, but test execution results were not available.",
      ],
      notes: [
        "Diff context was truncated or excluded; this description uses available commit and file metadata.",
      ],
    });
  });

  it("falls back to changed files when commit subjects are unavailable", () => {
    const note = generateFallbackNote({
      ...context,
      commits: [],
      files: [
        {
          filename: "README.md",
          status: "modified",
          additions: 2,
          deletions: 1,
          changes: 3,
        },
      ],
      totals: { additions: 2, deletions: 1, files: 1 },
    });

    expect(note.title).toBe("Update pull request changes");
    expect(note.changes).toEqual(["modified README.md"]);
    expect(note.testing).toEqual([
      "Testing details were not found in the commit history or changed files.",
    ]);
  });
});

describe("generateNote", () => {
  it("requests strict structured output and parses the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "int_test",
          status: "completed",
          steps: [
            { type: "thought", status: "done" },
            {
              type: "model_output",
              status: "done",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    title: "Add authentication",
                    summary: "Adds sign-in.",
                    changes: ["Add a route"],
                    testing: [
                      "Testing details were not found in the commit history or changed files.",
                    ],
                    notes: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await generateNote(context, {
      apiKey: "secret",
      model: "test-model",
      language: "en",
      fetchImpl,
    });
    expect(result.title).toBe("Add authentication");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const request = JSON.parse(String(init.body));
    expect(request.response_format).toMatchObject({
      type: "text",
      mime_type: "application/json",
    });
    expect(request.response_format.schema).toMatchObject({ type: "object" });
    expect(request.model).toBe("test-model");
    expect(request.generation_config).toEqual({ thinking_level: "low" });
    expect(request.store).toBe(false);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta2/interactions",
    );
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "secret",
    );
  });

  it("reports provider failures without exposing the key", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "rate limited" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      generateNote(context, {
        apiKey: "secret-value",
        model: "test-model",
        language: "en",
        fetchImpl,
        sleepImpl: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow("rate limited");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a timeout and reports an actionable final error", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(
      generateNote(context, {
        apiKey: "secret",
        model: "test-model",
        language: "en",
        timeoutSeconds: 90,
        fetchImpl,
        sleepImpl,
      }),
    ).rejects.toThrow(
      "timed out after 90 seconds on attempt 2 of 2. Consider reducing max-diff-characters or increasing timeout-seconds",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(1000);
  });

  it("rejects malformed JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: "not-json" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      generateNote(context, {
        apiKey: "secret",
        model: "test-model",
        language: "en",
        fetchImpl,
      }),
    ).rejects.toThrow("malformed JSON");
  });

  it("reports response status and step types when Gemini returns no model text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "int_empty",
          status: "incomplete",
          steps: [{ type: "thought", status: "done" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateNote(context, {
        apiKey: "secret",
        model: "test-model",
        language: "en",
        fetchImpl,
      }),
    ).rejects.toThrow(
      "no model text (status: incomplete; steps: thought; interaction: int_empty)",
    );
  });

  it("supports the legacy REST outputs shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          outputs: [
            {
              type: "text",
              text: JSON.stringify({
                title: "Add authentication",
                summary: "Adds sign-in.",
                changes: [],
                testing: [],
                notes: [],
              }),
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateNote(context, {
        apiKey: "secret",
        model: "test-model",
        language: "en",
        fetchImpl,
      }),
    ).resolves.toMatchObject({ title: "Add authentication" });
  });

  it("makes uncertainty and language requirements explicit in the prompt", () => {
    const prompt = buildPrompt(context, "fr");
    expect(prompt).toContain("in fr");
    expect(prompt).toContain("Testing details were not found");
    expect(prompt).toContain('"headBranch": "feature/auth"');
  });
});
