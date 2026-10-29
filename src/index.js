#!/usr/bin/env node
// Orchestrates one run of the Vetra deploy action: classify the ref, exchange
// OIDC for Renown bearer tokens, publish packages, optionally build/push a
// FUSION image, call deployApp, and (by default) wait for it to go READY.

import { classifyRef } from './ref.js';
import {
  deriveVersion,
  distTagForClassification,
  listPackageDirs,
  readPackageJson,
  registryForClassification,
  stripPrerelease,
} from './version.js';
import { getPullRequestHeadSha } from './github-event.js';
import { requestOidcToken } from './oidc.js';
import { exchangeToken } from './exchange.js';
import { publishPackage } from './publish.js';
import { parseFusionApps } from './fusion-apps.js';
import { buildFusionImages } from './images-step.js';
import { withUnansweredRetry } from './fetch-retry.js';
import { channelForClassification, recordArtifact } from './artifacts.js';
import { deployApp, pollDeployment } from './deploy.js';
import { appsAudience } from './rest.js';
import { createTokenSource } from './token-source.js';
import { writeSummary } from './summary.js';
import { mask, notice, setFailed, setOutput, warning } from './util.js';

const RENOWN_OIDC_AUDIENCE = 'https://renown.vetra.io';

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`required input '${name}' is missing`);
  return v;
}

function emptyOutputs() {
  setOutput('deployment-id', '');
  setOutput('environment-url', '');
  setOutput('app-url', '');
  setOutput('version', '');
}

async function main() {
  // See fetch-retry.js: a request after a long build can hit a dead keep-alive socket.
  globalThis.fetch = withUnansweredRetry(globalThis.fetch);
  const appId = requireEnv('INPUT_APP_ID');
  const vetraUrl = env('INPUT_VETRA_URL', 'https://switchboard.vetra.io');
  const renownUrl = env('INPUT_RENOWN_URL', 'https://switchboard.renown.vetra.io');
  const productionBranch = env('INPUT_PRODUCTION_BRANCH', 'main');
  // Not env(): an explicit empty string must mean "publish nothing" (as the
  // input's documentation says), not fall back to the '.' default. action.yml
  // always passes the input, so it is only undefined outside the action.
  const packageDirsInput = process.env.INPUT_PACKAGE_DIRS ?? '.';
  const fusionDockerfile = env('INPUT_FUSION_DOCKERFILE', '');
  const fusionContext = env('INPUT_FUSION_CONTEXT', '.');
  const fusionImageName = env('INPUT_FUSION_IMAGE_NAME', 'app');
  const fusionAppsInput = env('INPUT_FUSION_APPS', '');
  const wait = env('INPUT_WAIT', 'true') !== 'false';
  const timeoutMinutes = Number(env('INPUT_TIMEOUT_MINUTES', '15'));

  const ref = env('GITHUB_REF');
  const eventName = env('GITHUB_EVENT_NAME');
  const classification = classifyRef({ ref, productionBranch });

  if (classification.kind === 'skip') {
    notice(`Vetra: ${classification.reason} — skipping deploy.`);
    emptyOutputs();
    return;
  }

  // For pull_request runs, GITHUB_SHA is the ephemeral merge commit; the
  // deploy must reference the PR's real head commit.
  let sha = env('GITHUB_SHA');
  if (eventName === 'pull_request') {
    const headSha = getPullRequestHeadSha(process.env.GITHUB_EVENT_PATH);
    if (headSha) sha = headSha;
  }
  if (!sha) throw new Error('could not determine a commit sha (GITHUB_SHA / pull_request head.sha)');
  const sha7 = sha.slice(0, 7);
  const sha12 = sha.slice(0, 12);

  const registryUrl = registryForClassification(classification);
  const distTag = distTagForClassification(classification);

  let oidcToken;
  try {
    oidcToken = await requestOidcToken(RENOWN_OIDC_AUDIENCE);
  } catch (err) {
    setFailed(err.message);
    return;
  }
  mask(oidcToken);

  // The CI deploy API (registry-credentials/deploy/deployments/artifacts) is a
  // separate audience from the publish registries: it identifies this workload
  // to the vetra-apps subgraph itself, not to an npm registry.
  // Fresh GitHub OIDC token + exchange every few minutes: the image build and
  // the deploy wait together can outlive one 10-minute Renown token.
  // Created before the release early-return, and lazy, so a tag run can still
  // record its artifacts without minting a token it never uses.
  const appsToken = createTokenSource(async () => {
    const oidc = await requestOidcToken(RENOWN_OIDC_AUDIENCE);
    mask(oidc);
    const fresh = await exchangeToken(renownUrl, oidc, appsAudience(vetraUrl));
    mask(fresh);
    return fresh;
  });
  const channel = channelForClassification(classification);
  const runId = env('GITHUB_RUN_ID');

  const packageDirs = listPackageDirs(packageDirsInput);
  const publishedPackages = [];

  if (packageDirs.length > 0) {
    const registryToken = await exchangeToken(renownUrl, oidcToken, registryUrl);
    mask(registryToken);

    for (const dir of packageDirs) {
      const pkg = readPackageJson(dir);
      if (!pkg) {
        warning(`Vetra: no package.json found in '${dir}' — skipping.`);
        continue;
      }
      if (pkg.private) {
        warning(`Vetra: '${dir}' (${pkg.name ?? 'unnamed'}) is private — skipping publish.`);
        continue;
      }
      const base = stripPrerelease(pkg.version);
      const version =
        classification.kind === 'release'
          ? classification.tagVersion
          : deriveVersion(base, classification, { runNumber: env('GITHUB_RUN_NUMBER'), sha7 });

      publishPackage({ dir, version, registryUrl, distTag, token: registryToken });
      publishedPackages.push({ name: pkg.name, version, registryUrl });

      await recordArtifact(vetraUrl, await appsToken(), {
        appId,
        kind: 'PACKAGE',
        name: pkg.name,
        version,
        reference: `${registryUrl.replace(/\/+$/, '')}/${pkg.name}`,
        commitSha: sha,
        runId,
        channel,
      });
    }
  }

  // Built before a release returns: a release tag publishes its images too
  // (channel LATEST), so a licence template can follow them.
  const fusionApps = parseFusionApps(fusionAppsInput, {
    dockerfile: fusionDockerfile,
    imageName: fusionImageName,
    context: fusionContext,
  });
  const imageTag = await buildFusionImages({ fusionApps, vetraUrl, appsToken, appId, sha, sha12, runId, channel });

  if (classification.kind === 'release') {
    notice(`Vetra: published release ${classification.tagVersion} to ${distTag}; tags are publish-only (no deploy).`);
    setOutput('deployment-id', '');
    setOutput('environment-url', '');
    setOutput('app-url', '');
    setOutput('version', classification.tagVersion);
    return;
  }

  const deployInput = {
    appId,
    kind: classification.kind === 'production' ? 'PRODUCTION' : 'PREVIEW',
    prNumber: classification.kind === 'preview' ? classification.prNumber : null,
    gitRef: ref,
    sha,
    runUrl: `${env('GITHUB_SERVER_URL')}/${env('GITHUB_REPOSITORY')}/actions/runs/${env('GITHUB_RUN_ID')}`,
    actorGithub: env('GITHUB_ACTOR'),
    packages: publishedPackages,
    imageTag,
  };

  const deployment = await deployApp(vetraUrl, await appsToken(), deployInput);
  const runVersion = publishedPackages[0]?.version ?? '';
  setOutput('deployment-id', deployment.id);
  setOutput('version', runVersion);

  if (!wait) {
    setOutput('environment-url', deployment.urls?.app ?? '');
    setOutput('app-url', deployment.urls?.app ?? '');
    writeSummary(deployment);
    return;
  }

  const final = await pollDeployment(vetraUrl, appsToken, deployment.id, { timeoutMinutes });
  setOutput('environment-url', final.urls?.app ?? '');
  setOutput('app-url', final.urls?.app ?? '');
  writeSummary(final);

  if (final.status === 'FAILED') {
    setFailed(`Vetra deployment failed: ${final.error ?? 'unknown error'}`);
  } else if (final.status === 'TIMEOUT') {
    setFailed(`Vetra deployment did not become READY within ${timeoutMinutes} minutes (last status: DEPLOYING).`);
  } else if (final.status === 'SUPERSEDED') {
    notice('Vetra: deployment was superseded by a newer run for the same environment; treating this run as successful.');
  }
}

main().catch((err) => {
  setFailed(err?.stack || String(err?.message || err));
  process.exitCode = 1;
});
