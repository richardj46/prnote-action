# PRNote v0.1.0

Released: 12 July 2026

PRNote's first MVP release automatically standardizes pull request titles and descriptions from the source branch's commit history.

## Highlights

- Writes pull request titles as `<source branch>: pull request`.
- Writes the pull request body as a plain bullet list of source-branch commit messages.
- Preserves GitHub commit order and normalizes multiline commit messages onto one line.
- Uses Gemini 3.5 Flash for optional rich summary generation.
- Falls back deterministically to commit history when Gemini is unavailable, times out, returns invalid output, or has no API key configured.
- Optionally writes one managed PRNote conversation comment with the richer generated summary.
- Excludes lockfiles, generated files, build output, coverage, and other noisy paths from model context by default.
- Limits selected diff context and retries transient Gemini failures once.
- Never executes pull request code or merges the pull request automatically.

## Generated PR format

Title:

```text
feature/auth: pull request
```

Body:

```text
 - feat: add passwordless sign-in
 - fix: reject expired verification links
 - test: cover password reset
```

GitHub appends the pull request number to merge-commit titles according to the repository's merge settings.

## Installation

```yaml
name: PRNote

on:
  pull_request:
    types: [opened]

permissions:
  contents: read
  pull-requests: write

jobs:
  generate-pr-note:
    runs-on: ubuntu-latest
    steps:
      - name: Generate PR title and description
        uses: prnote/prnote-action@v0.1.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

`gemini-api-key` is optional. Without it, PRNote uses commit-history fallback generation.

## Merge-message setup

To show PRNote's title and commit-message list in GitHub's editable merge form:

1. Open **Repository Settings → General → Pull Requests**.
2. Enable **Allow merge commits**.
3. Change its dropdown from **Default message** to **Pull request title and description**.

This makes GitHub use the PR title as the merge-commit title and the PR body as its extended description. The user can still edit both fields before merging.

## Defaults

- Title updates: enabled
- Body updates: enabled
- Title overwrite: enabled
- Body overwrite: enabled
- PR conversation comment: disabled
- Gemini model: `gemini-3.5-flash`
- Gemini timeout: 120 seconds per attempt
- Maximum selected diff context: 20,000 characters

Set `comment: "true"` to enable the managed rich-summary comment. Set `overwrite-title: "false"` or `overwrite-body: "false"` to preserve meaningful existing content.

## Reliability and privacy

- Gemini requests use structured JSON output, low thinking, and `store: false`.
- Transient timeouts, rate limits, and server failures are retried once.
- Provider failures never prevent commit-history generation.
- API keys and GitHub tokens are masked in workflow logs.
- Excluded file content is not sent to Gemini.

## Known limitations

- This release handles `pull_request.opened` only.
- Normal `pull_request` workflows cannot access repository secrets for untrusted fork pull requests, so those runs use fallback generation when no Gemini key is available.
- GitHub's editable merge-message defaults are controlled by repository settings; the normal workflow token cannot change that repository-level configuration.
- Merge queues may apply their own commit-message behavior.
