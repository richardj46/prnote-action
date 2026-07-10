import type { GeneratedNote, GenerationContext } from "./types.js";

interface GeminiInteractionResult {
  output_text?: string;
  error?: { message?: string };
}

const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "changes", "testing", "notes"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    changes: { type: "array", items: { type: "string" } },
    testing: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

function responseText(response: GeminiInteractionResult): string {
  if (response.output_text) return response.output_text;
  throw new Error("Gemini returned no text output.");
}

export function validateGeneratedNote(value: unknown): GeneratedNote {
  if (!value || typeof value !== "object") {
    throw new Error("The generated note was not a JSON object.");
  }
  const note = value as Record<string, unknown>;
  const arrays = ["changes", "testing", "notes"] as const;
  if (typeof note.title !== "string" || !note.title.trim()) {
    throw new Error("The generated note did not include a title.");
  }
  const title = note.title.trim().replace(/\s+/g, " ");
  if (title.length > 120) {
    throw new Error("The generated title exceeded 120 characters.");
  }
  if (typeof note.summary !== "string" || !note.summary.trim()) {
    throw new Error("The generated note did not include a summary.");
  }
  for (const key of arrays) {
    if (
      !Array.isArray(note[key]) ||
      !note[key].every((item) => typeof item === "string")
    ) {
      throw new Error(`The generated '${key}' field was invalid.`);
    }
  }
  return {
    title,
    summary: note.summary.trim(),
    changes: (note.changes as string[])
      .map((item) => item.trim())
      .filter(Boolean),
    testing: (note.testing as string[])
      .map((item) => item.trim())
      .filter(Boolean),
    notes: (note.notes as string[]).map((item) => item.trim()).filter(Boolean),
  };
}

export function buildPrompt(
  context: GenerationContext,
  language: string,
): string {
  return `Create a concise, factual pull request title and description in ${language}.

Rules:
- Describe only changes supported by the supplied evidence; do not speculate.
- Keep the title under 120 characters and use clear imperative or descriptive wording.
- Do not invent issue numbers, test results, deployment steps, or configuration requirements.
- If no testing evidence exists, use exactly "Testing details were not found in the commit history or changed files." as the only testing item.
- Put migrations, breaking changes, compatibility concerns, or required configuration in notes when evidence supports them.
- Avoid merely listing filenames. Keep list items concise and omit unsupported details.

Pull request context:
${JSON.stringify(context, null, 2)}`;
}

export async function generateNote(
  context: GenerationContext,
  options: {
    apiKey: string;
    model: string;
    language: string;
    timeoutSeconds?: number;
    fetchImpl?: typeof fetch;
    sleepImpl?: (milliseconds: number) => Promise<void>;
  },
): Promise<GeneratedNote> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl =
    options.sleepImpl ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutSeconds = options.timeoutSeconds ?? 120;
  const maxAttempts = 2;
  let result: GeminiInteractionResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": options.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            input: `You write trustworthy pull request documentation from repository evidence. Return only the requested structured result.\n\n${buildPrompt(context, options.language)}`,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: NOTE_SCHEMA,
            },
            generation_config: { thinking_level: "low" },
            store: false,
          }),
          signal: AbortSignal.timeout(timeoutSeconds * 1000),
        },
      );

      result = (await response.json()) as GeminiInteractionResult;
      if (response.ok) break;

      const transient = [429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === maxAttempts) {
        throw new Error(
          `Gemini request failed (${response.status}) on attempt ${attempt} of ${maxAttempts}: ${result.error?.message ?? "unknown error"}`,
        );
      }
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" ||
          error.name === "AbortError" ||
          /timeout|timed out|aborted/i.test(error.message));
      if (
        error instanceof Error &&
        error.message.startsWith("Gemini request failed")
      ) {
        throw error;
      }
      if (attempt === maxAttempts) {
        if (timedOut) {
          throw new Error(
            `Gemini request timed out after ${timeoutSeconds} seconds on attempt ${attempt} of ${maxAttempts}. Consider reducing max-diff-characters or increasing timeout-seconds.`,
          );
        }
        throw error;
      }
    }

    await sleepImpl(1000 * attempt);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText(result ?? {}));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Gemini returned malformed JSON.");
    }
    throw error;
  }
  return validateGeneratedNote(parsed);
}

function section(heading: string, items: string[]): string | null {
  if (items.length === 0) return null;
  return `## ${heading}\n\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function renderNote(note: GeneratedNote): string {
  return [
    `## Summary\n\n${note.summary}`,
    section("Changes", note.changes),
    section("Testing", note.testing),
    section("Notes", note.notes),
  ]
    .filter((value): value is string => value !== null)
    .join("\n\n");
}
