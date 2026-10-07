// Parses the `fusion-apps` input: one FUSION image per line, written as
//
//   <image-name>: <dockerfile> [build-context]
//
// The single-image `fusion-dockerfile` / `fusion-image-name` inputs stay
// supported as a one-entry shorthand, so repositories written against v1 keep
// working unchanged.

/**
 * @typedef {{ name: string, dockerfile: string, context: string }} FusionApp
 */

/**
 * @param {string | undefined} input the raw `fusion-apps` value
 * @param {{ dockerfile?: string, imageName?: string, context?: string }} [shorthand]
 *   the legacy single-image inputs, used only when `input` is empty
 * @returns {FusionApp[]}
 */
export function parseFusionApps(input, shorthand = {}) {
  const lines = String(input ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

  if (lines.length === 0) {
    if (!shorthand.dockerfile) return [];
    return [
      {
        name: shorthand.imageName || 'app',
        dockerfile: shorthand.dockerfile,
        context: shorthand.context || '.',
      },
    ];
  }

  /** @type {FusionApp[]} */
  const apps = [];
  const seen = new Set();
  for (const line of lines) {
    const at = line.indexOf(':');
    // A line we cannot read must fail the run. Skipping it would deploy a
    // reference to an image that was never built.
    if (at === -1) {
      throw new Error(
        `fusion-apps: expected '<name>: <dockerfile>' but got '${line}'`,
      );
    }
    const name = line.slice(0, at).trim();
    const rest = line.slice(at + 1).trim();
    const [dockerfile, context = '.'] = rest.split(/\s+/).filter(Boolean);

    if (!name) throw new Error(`fusion-apps: missing image name in '${line}'`);
    if (!dockerfile)
      throw new Error(`fusion-apps: missing dockerfile in '${line}'`);
    if (seen.has(name))
      throw new Error(`fusion-apps: duplicate image name '${name}'`);

    seen.add(name);
    apps.push({ name, dockerfile, context });
  }
  return apps;
}
