import * as core from "@actions/core";
import type { ActionConfig } from "./types.js";

const DEFAULT_EXCLUSIONS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.min.js",
  "*.map",
  "dist/**",
  "build/**",
  "vendor/**",
  "coverage/**",
  "generated/**",
  ".next/**",
  "target/**",
];

function booleanInput(name: string, fallback: boolean): boolean {
  const value = core.getInput(name).trim();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Input '${name}' must be either 'true' or 'false'.`);
}

function positiveIntegerInput(name: string, fallback: number): number {
  const value = core.getInput(name).trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Input '${name}' must be a non-negative integer.`);
  }
  return parsed;
}

export function readConfig(): ActionConfig {
  const githubToken = core.getInput("github-token", { required: true });
  const apiKey = core.getInput("api-key", { required: true });
  core.setSecret(githubToken);
  core.setSecret(apiKey);

  const rawExclude = core.getInput("exclude").trim();
  const exclude = (rawExclude ? rawExclude.split(",") : DEFAULT_EXCLUSIONS)
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  return {
    githubToken,
    apiKey,
    updateTitle: booleanInput("update-title", true),
    updateBody: booleanInput("update-body", true),
    overwriteTitle: booleanInput("overwrite-title", false),
    overwriteBody: booleanInput("overwrite-body", false),
    maxDiffCharacters: positiveIntegerInput("max-diff-characters", 20_000),
    exclude,
    language: core.getInput("language").trim() || "en",
    model: core.getInput("model").trim() || "gpt-5.4-mini",
  };
}
