# vetra-deploy-action

A public composite GitHub Action that publishes your packages, optionally builds and pushes a
FUSION image, and deploys a [Vetra App](https://vetra.io) — production on pushes to your
production branch, a slim preview environment per pull request.

It authenticates with no long-lived secrets: it exchanges the run's GitHub OIDC token for a
short-lived Renown bearer token (one per registry/switchboard audience it needs), scoped to
exactly this repository, ref, and run.

## What it does

On every run the action:

1. Installs dependencies and builds (`install-command` / `build-command`, both skippable).
2. Classifies the ref:
   - `refs/heads/<production-branch>` → **production**
   - `refs/pull/<n>/merge` → **preview**
   - `refs/tags/v*` → **release** (publish-only, see below)
   - anything else → skipped, with a `::notice::` and no further steps.
3. Requests a GitHub Actions OIDC ID token (audience `https://renown.vetra.io`) and exchanges it
   with Renown for a bearer token per audience it actually needs (the target npm registry, and —
   for production/preview — the Vetra switchboard).
4. Publishes each directory in `package-dirs` whose `package.json` isn't `"private": true`:
   writes a scratch `.npmrc` scoped to the target registry, bumps the version locally
   (`npm version --no-git-tag-version`, never committed), runs `pnpm pack`, then
   `npm publish <tarball>`.
5. If `fusion-dockerfile` is set, fetches a push-only Harbor robot for the App
   (`appRegistryCredentials`), then builds and pushes
   `cr.vetra.io/<project>/<image-name>:sha-<sha12>` with `--build-arg NEXT_DEPLOYMENT_ID=sha-<sha12>`.
6. Calls `deployApp` and (unless `wait: false`) polls `appDeployment` every 10s until it reaches
   `READY`/`FAILED`/`SUPERSEDED`, or the timeout elapses. Writes a job summary with the app,
   Connect, and switchboard URLs, and sets the action's outputs.

A release tag (`v*`) only publishes — it does not call `deployApp`. Production/preview releases
never touch secrets or packages from a **forked** repository's pull request: GitHub does not
hand out OIDC tokens or secrets to fork PRs, so the action fails fast with a clear error if it's
ever invoked without one (see [Troubleshooting](#troubleshooting)) — the workflow template below
also guards this with an `if:` on the job.

## Inputs

| Input | Default | Description |
|---|---|---|
| `app-id` | _(required)_ | The Vetra App id, from the app's page on vetra.io. |
| `vetra-url` | `https://switchboard.vetra.io` | Vetra switchboard URL (GraphQL at `<vetra-url>/graphql`). |
| `renown-url` | `https://switchboard.renown.vetra.io` | Renown switchboard URL used for the OIDC exchange. |
| `production-branch` | `main` | Branch that deploys to the production environment. |
| `package-dirs` | `.` | Newline/space-separated list of directories with a `package.json` to publish. Empty string disables publishing. |
| `build-command` | `pnpm build` | Build command, run before publishing. Empty string skips it. |
| `install-command` | `pnpm install --frozen-lockfile` | Install command. Empty string skips it. |
| `fusion-dockerfile` | _(empty)_ | Path to a Dockerfile for a FUSION image. Empty disables the image build/push. |
| `fusion-context` | `.` | Docker build context for the FUSION image. |
| `fusion-image-name` | `app` | Image name (without registry/project) for the FUSION image. |
| `wait` | `true` | Wait for the deployment to reach a terminal status before finishing. |
| `timeout-minutes` | `15` | Minutes to wait for `READY` before failing the job. |

## Outputs

| Output | Description |
|---|---|
| `deployment-id` | The id of the created `AppDeployment` (empty for a tag release or a skipped ref). |
| `environment-url` | The deployed environment's app URL. |
| `app-url` | Alias of `environment-url`. |
| `version` | The version published/derived for this run. |

## Setup

### 1. Create the App on vetra.io

From **Apps → New App**, install the Vetra Deploy GitHub App on your repository, name the App,
pick (or create) its production environment, and authorize the App's identity on Renown. Copy
the App id shown on the App's page — that's `app-id` below.

### 2. Add the workflow

Either accept the setup pull request vetra.io opens for you, or add
`.github/workflows/vetra.yml` yourself:

```yaml
name: Vetra
on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  id-token: write
  contents: read
concurrency:
  group: vetra-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
jobs:
  deploy:
    if: github.event.pull_request.head.repo.fork != true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: powerhouse-inc/vetra-deploy-action@v1
        with:
          app-id: <APP_ID>
```

Replace `<APP_ID>` with the App id from step 1 (a repo variable such as
`${{ vars.VETRA_APP_ID }}` works well too). `permissions: id-token: write` is required — without
it, GitHub never issues the OIDC token the action needs, and the step fails immediately with an
explanatory error.

That's it: no registry tokens, no Harbor credentials, no switchboard secrets to configure. Every
credential the action uses is minted per run from the OIDC exchange.

## Versions and dist-tags

| Trigger | Version | Registry | dist-tag |
|---|---|---|---|
| Pull request `#42` | `<base>-pr.42.<sha7>` | `registry.dev.vetra.io` | `pr-42` |
| Push to the production branch | `<base>-main.<run_number>.<sha7>` | `registry.vetra.io` | `main` |
| Tag `v1.4.0` | `1.4.0` | `registry.vetra.io` | `latest` |

`<base>` is each published package's own `package.json` `version`, with any prerelease
(`-foo`) or build metadata (`+foo`) stripped. `<sha7>`/`<sha12>` come from the commit actually
being deployed — for pull requests that's the PR's head commit, not the ephemeral merge commit
GitHub checks out. The action never commits a version bump back to the repository; `npm version`
only edits the local, packed copy.

Tag pushes (`refs/tags/v*`) **publish only** — they don't call `deployApp`. Use them to cut a
`latest` release of a package without touching any Vetra environment.

## Previews

Every pull request against the production branch gets its own preview environment, created on
its first successful deploy. Pushing new commits to the PR redeploys the same preview (a new
`AppDeployment` supersedes the previous one). The preview is deleted when the PR closes or
merges, when the App's preview limit is exceeded (oldest preview evicted first), or after the
App's preview TTL of inactivity — whichever comes first. Preview environments run on the
smallest supported size, with backups disabled and no environment secrets, so don't rely on a
preview URL staying up, and don't put real data behind one.

Each deployment's job summary includes the preview's app, Connect, and switchboard URLs; vetra.io
also posts/updates a sticky comment on the PR with the same links once the GitHub App webhook
feedback is wired up on the Vetra side.

## Troubleshooting

**"GitHub OIDC token request variables are missing"** — the job (or workflow) is missing
`permissions: { id-token: write }`. Add it at the workflow or job level and re-run.

**Fork pull requests get no preview.** GitHub does not provide OIDC tokens or secrets to
`pull_request` workflow runs triggered from a forked repository, by design — there is no way for
this action to authenticate in that case. The workflow template's
`if: github.event.pull_request.head.repo.fork != true` skips the job entirely for fork PRs so
the run doesn't fail noisily; if you remove that guard, the action will fail at the OIDC step
with the error above. If you need previews for fork contributions, trigger a separate,
unprivileged workflow on `pull_request_target` and deploy manually, or ask contributors to push
branches to the upstream repo instead of a fork.

**`npm publish` fails on `workspace:` or `catalog:` version specifiers.** This is why the action
uses `pnpm pack` (not `npm pack`) before `npm publish`: pnpm resolves `workspace:*` and
`catalog:` protocol dependencies to real, installable version ranges when it packs the tarball. A
plain `npm pack`/`npm publish` would ship those specifiers literally, producing a package nobody
else can install. If you still see unresolved `workspace:`/`catalog:` ranges in a published
tarball, check that the package in question is part of a pnpm workspace (`pnpm-workspace.yaml`)
and that `install-command` actually installs with pnpm.

**A directory in `package-dirs` was silently skipped.** Either it has no `package.json` or its
`package.json` has `"private": true` — both produce a `::warning::` in the log rather than
failing the run. Check the run's log for `Vetra: ... skipping`.

**Deployment stuck in `DEPLOYING` until timeout.** The watcher on the Vetra side moves a
deployment to `READY` once the environment reports healthy and its rendered package/image
versions match what was requested. A timeout usually means the environment failed to apply the
new versions — check the App's Deployments tab on vetra.io, or the environment's own gitops
status, for the underlying error. Increase `timeout-minutes` only if the environment is simply
slow to come up (e.g. a cold image pull), not to paper over a real failure.

**GraphQL errors.** The action surfaces `extensions.code` alongside the message, e.g.
`[PREVIEWS_DISABLED] previews are disabled for this App` or
`[FORBIDDEN] caller is not this App's identity`. These map to the vetra-apps subgraph's error
codes — see the Vetra docs for what triggers each one.

## Local development

```sh
npm test   # node --test, no network/build dependencies
```

All logic that doesn't require real network/process I/O (ref classification, version
derivation, PR number parsing, GraphQL error formatting, image ref construction, deployment
polling) is covered by plain `node --test` unit tests in `test/`, with `fetch`/`child_process`
faked at the call site. There is no build step and no npm dependency — `src/` is plain Node 22
ESM using global `fetch` and `node:child_process`.

## License

[MIT](./LICENSE)
