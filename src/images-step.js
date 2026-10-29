// The FUSION image step: build and push each image to the App's Harbor
// project and record it as an artifact. Runs for previews, production and
// release tags alike; only the deploy that follows differs.

import { fetchAppRegistryCredentials } from './deploy.js';
import { buildAndPushImage, buildImageRef } from './image.js';
import { recordArtifact } from './artifacts.js';
import { mask } from './util.js';

/**
 * @param {{
 *   fusionApps: { name: string, dockerfile: string, context: string }[],
 *   vetraUrl: string, appsToken: () => Promise<string>, appId: string,
 *   sha: string, sha12: string, runId: string, channel: string | null,
 * }} input
 * @param {{ credentials?: typeof fetchAppRegistryCredentials, build?: typeof buildAndPushImage, record?: typeof recordArtifact }} [deps]
 * @returns {Promise<string | null>} the first image's full reference (the App's own service), or null
 */
export async function buildFusionImages(input, deps = {}) {
  const { fusionApps, vetraUrl, appsToken, appId, sha, sha12, runId, channel } = input;
  if (fusionApps.length === 0) return null;
  const credentials = deps.credentials ?? fetchAppRegistryCredentials;
  const build = deps.build ?? buildAndPushImage;
  const record = deps.record ?? recordArtifact;

  const creds = await credentials(vetraUrl, await appsToken(), appId);
  mask(creds.password);
  const registryHost = creds.registry.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  let first = null;
  for (const app of fusionApps) {
    const imageRef = buildImageRef({ registry: creds.registry, project: creds.project, imageName: app.name, sha12 });
    build({
      dockerfile: app.dockerfile,
      context: app.context,
      imageRef,
      buildArgs: { NEXT_DEPLOYMENT_ID: `sha-${sha12}` },
      registryHost,
      username: creds.username,
      password: creds.password,
    });
    await record(vetraUrl, await appsToken(), {
      appId,
      kind: 'FUSION_IMAGE',
      name: app.name,
      version: `sha-${sha12}`,
      reference: imageRef,
      commitSha: sha,
      runId,
      channel,
    });
    // The deployment references ONE image: the first entry is the App's own
    // service; the rest are recorded so a licence template can offer them.
    if (first === null) first = imageRef;
  }
  return first;
}
