# Releasing react-modular-di

Run these commands from the repository root with Node.js 22+ and npm.

## Prepare

1. Review the version, changelog, README, repository metadata and supported toolchain matrix.
2. Install the locked dependencies and Chromium:

   ```sh
   npm ci
   npx playwright install chromium
   ```

3. Run a publication dry run:

   ```sh
   npm publish --dry-run
   ```

   This runs the complete `prepublishOnly` pipeline and prints the intended
   tarball contents without publishing to npm. Local fixture tarballs and
   dependency installations are still created so the integration tests can run.

   The tarball must contain only `package.json`, `README.md`, `LICENSE` and the
   built `dist/` files. Runtime dependencies must not include React, Next.js,
   Playwright or a bundled copy of tsyringe.

4. Review and commit the intended release changes, then push them to GitHub.
   Build/test artifacts, installed dependencies and local npm credentials must
   not be committed.

## Publish

Publishing is a separate, explicit step; running checks does not publish anything.

1. Authenticate with the npm account that should own the package:

   ```sh
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   ```

2. Confirm the intended version has not already been published. For the first
   release the package may return `E404`; npm still decides name availability at
   publication time:

   ```sh
   npm view react-modular-di versions --registry=https://registry.npmjs.org/
   ```

3. Publish:

   ```sh
   npm publish
   ```

   `publishConfig` selects the public npm registry and public access.
   `prepublishOnly` reruns type checking, unit/React tests, build, formatting,
   installed-tarball React 18/19 tests and the Next.js/Chromium production test.
   Complete any npm browser/2FA prompts locally; do not share credentials or OTPs.

## Verify the published release

1. Check the registry metadata:

   ```sh
   npm view react-modular-di@0.1.0 version dist.integrity repository --registry=https://registry.npmjs.org/
   ```

2. Install the exact published version in a fresh application:

   ```sh
   npm install react-modular-di@0.1.0 tsyringe@4.10.0
   ```

3. Check both public imports and a real constructor-injected service in that
   application's production build. The automated prepublication tests use local
   tarballs; this step verifies the package actually delivered by npm.
4. Create and push the `v0.1.0` Git tag for the verified release commit.

For subsequent releases, use a new version and update these examples accordingly.
An already published version cannot be overwritten.
