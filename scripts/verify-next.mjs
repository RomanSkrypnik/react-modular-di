import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(project, ".package-test");
mkdirSync(artifacts, { recursive: true });
const cwd = mkdtempSync(join(artifacts, "next-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// A publication dry run still needs real local tarballs and fixture installations.
const packed = JSON.parse(
  execFileSync(npm, ["pack", "--dry-run=false", "--json", "--pack-destination", cwd], {
    cwd: project,
    encoding: "utf8",
  }),
)[0];
assert.ok(packed);
cpSync(join(project, "tests/fixtures/next"), cwd, { recursive: true });
const manifestPath = join(cwd, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies["react-modular-di"] = `file:${join(cwd, packed.filename)}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
execFileSync(npm, ["install", "--dry-run=false", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd,
  stdio: "inherit",
});

const next = join(cwd, "node_modules/next/dist/bin/next");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
execFileSync(process.execPath, [next, "build"], { cwd, env, stdio: "inherit", timeout: 180_000 });

const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const address = socket.address();
assert.ok(address && typeof address !== "string");
await new Promise((resolve, reject) =>
  socket.close((error) => (error ? reject(error) : resolve())),
);

const server = spawn(
  process.execPath,
  [next, "start", "--hostname", "127.0.0.1", "--port", String(address.port)],
  {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
let serverError;
server.on("error", (error) => {
  serverError = error;
});
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});
const url = `http://127.0.0.1:${address.port}`;
let browser;

try {
  const deadline = Date.now() + 30_000;
  let response;
  let connectionError;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next.js exited before it was ready:\n${serverOutput}`);
    }
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      break;
    } catch (error) {
      connectionError = error;
      await delay(100);
    }
  }
  if (!response)
    throw new Error(`Next.js startup timed out:\n${serverOutput}`, { cause: connectionError });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("next-production:configured"));

  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url);
  assert.equal(await page.getByTestId("message").textContent(), "next-production:configured");
  await page.getByRole("button", { name: "Resolve again" }).click();
  await page.getByText("Clicks: 1", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("identity").textContent(), "same instance");
  assert.deepEqual(errors, []);
  console.log(
    `Next.js ${manifest.dependencies.next}: production build, SSR, hydration and singleton identity verified`,
  );
  console.log(`Fixture: ${cwd}`);
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      const timeout = setTimeout(() => server.kill("SIGKILL"), 5_000);
      timeout.unref();
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
