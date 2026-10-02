// Docker image-ref construction (pure) and the build/login/push side effects.

import { execCmd } from './util.js';

/**
 * Builds the full `<host>/<project>/<image>:sha-<sha12>` reference used for
 * both the `docker build -t` tag and the push target.
 * @param {{ registry: string, project: string, imageName: string, sha12: string }} opts
 */
export function buildImageRef({ registry, project, imageName, sha12 }) {
  if (!registry || !project || !imageName || !sha12) {
    throw new Error('buildImageRef requires registry, project, imageName, and sha12');
  }
  const host = String(registry).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${host}/${project}/${imageName}:sha-${sha12}`;
}

/**
 * Logs in to the registry (password via stdin, never argv/env dump), builds
 * the Dockerfile with the given build args, and pushes the resulting image.
 * Never logs the password; callers should also `mask()` it beforehand.
 * @param {{
 *   dockerfile: string, context: string, imageRef: string,
 *   buildArgs?: Record<string, string>,
 *   registryHost: string, username: string, password: string,
 * }} opts
 */
export function buildAndPushImage({ dockerfile, context, imageRef, buildArgs = {}, registryHost, username, password }) {
  execCmd('docker', ['login', registryHost, '-u', username, '--password-stdin'], { input: password });

  const buildArgFlags = Object.entries(buildArgs).flatMap(([key, value]) => ['--build-arg', `${key}=${value}`]);
  execCmd('docker', ['build', '-f', dockerfile, context, ...buildArgFlags, '-t', imageRef]);
  execCmd('docker', ['push', imageRef]);
}
