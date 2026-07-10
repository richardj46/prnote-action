# PRNote

PRNote is a JavaScript GitHub Action that turns branch names, commit messages, changed files, and selected diff excerpts into a concise pull request title and description.

It is intentionally narrow: PRNote documents a change; it does not review code, scan security, score pull requests, or replace CI.

## Usage

Create `.github/workflows/prnote.yml` in the repository that will use PRNote:

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
        uses: your-github-name/prnote@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          api-key: ${{ secrets.OPENAI_API_KEY }}
```

Add `OPENAI_API_KEY` as a repository or organization Actions secret. No checkout step is required: PRNote reads PR metadata and patches through the GitHub API and never executes pull request code.

## Safe defaults

By default, PRNote updates a title only when it is empty, a placeholder, or resembles the source branch. It updates a body only when it is empty or looks like an untouched template. Meaningful human-written content, screenshots, completed checklists, testing instructions, issue references, and rollout notes are preserved.

When neither field is eligible for an update, PRNote stops before collecting repository context or calling OpenAI.

Generation and GitHub API failures are non-blocking. The action emits a warning, reports both outputs as `false`, and leaves the existing PR unchanged.

## Inputs

| Input                 | Default               | Description                                                                                                      |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `github-token`        | required              | Token used to read and update the PR.                                                                            |
| `api-key`             | required              | OpenAI API key.                                                                                                  |
| `update-title`        | `true`                | Allow title generation.                                                                                          |
| `update-body`         | `true`                | Allow body generation.                                                                                           |
| `overwrite-title`     | `false`               | Replace a meaningful existing title.                                                                             |
| `overwrite-body`      | `false`               | Replace a meaningful existing body.                                                                              |
| `max-diff-characters` | `20000`               | Maximum selected patch characters sent for generation; use `0` to send no patches.                               |
| `exclude`             | generated/noisy files | Comma-separated minimatch globs excluded from file and diff context. Providing this input replaces the defaults. |
| `language`            | `en`                  | Output language or locale instruction.                                                                           |
| `model`               | `gpt-5.4-mini`        | OpenAI Responses API model.                                                                                      |

Default exclusions include lockfiles, source maps, minified JavaScript, build output, coverage, generated directories, `.next`, and Rust `target` output.

The action exposes `title-updated` and `body-updated` outputs.

### Overwrite example

```yaml
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  api-key: ${{ secrets.OPENAI_API_KEY }}
  overwrite-title: "true"
  overwrite-body: "true"
  language: en-GB
  max-diff-characters: "10000"
```

Overwrite mode is explicit because it can replace carefully written content.

## Generated format

PRNote asks the model for schema-validated structured output and renders only populated sections:

```markdown
## Summary

Adds a passwordless sign-in flow using emailed verification links.

## Changes

- Add endpoints for requesting and verifying sign-in links
- Add pending and completed verification states

## Testing

- Add unit tests for verification token validation

## Notes

- Requires the EMAIL_FROM environment variable
```

The prompt forbids invented tests, issue numbers, deployment steps, and configuration requirements. A generated note is validated before any update is sent to GitHub.

## Privacy and fork pull requests

PRNote sends the current PR title/body, branch names, commit messages, changed filenames and statistics, plus up to `max-diff-characters` selected patch characters to OpenAI. Excluded files are omitted from both the file list and patch excerpts. GitHub and OpenAI apply their respective data-handling terms; evaluate those terms for your repository before enabling the action.

Normal `pull_request` workflows do not receive repository secrets for pull requests from untrusted forks, so PRNote cannot call OpenAI in that situation. This is a documented MVP limitation. Avoid changing the workflow to check out untrusted code under `pull_request_target`, because doing so can expose secrets.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm test
npm run check
npm run build
```

`dist/index.js` is committed because GitHub Actions executes the bundled file. Run the build after every source or dependency change and include the resulting bundle in releases.

## Release checklist

- Verify tests, type checking, formatting, and that a clean build does not change `dist`.
- Create an immutable semantic version tag such as `v1.0.0`.
- Move the major `v1` tag to the same verified commit.
- Publish a GitHub Release with upgrade notes.

## License

[MIT](LICENSE)
