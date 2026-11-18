import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(project, ".package-test");
mkdirSync(artifacts, { recursive: true });
const runDirectory = mkdtempSync(join(artifacts, "run-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// A publication dry run still needs real local tarballs and fixture installations.
const packed = JSON.parse(
  execFileSync(npm, ["pack", "--dry-run=false", "--json", "--pack-destination", runDirectory], {
    cwd: project,
    encoding: "utf8",
  }),
)[0];
assert.ok(packed);
assert.ok(
  packed.files.every(
    ({ path }) =>
      path === "package.json" ||
      path === "README.md" ||
      path === "LICENSE" ||
      path.startsWith("dist/"),
  ),
);
const tarball = join(runDirectory, packed.filename);

const reactEntry = readFileSync(join(project, "dist/react.js"), "utf8");
assert.ok(reactEntry.startsWith('"use client";'));
assert.ok(!readFileSync(join(project, "dist/index.js"), "utf8").includes('"use client"'));

const matrix = [
  { react: "18.3.1", reactTypes: "18.3.12", domTypes: "18.3.1" },
  { react: "19.2.0", reactTypes: "19.3.0", domTypes: "19.3.0" },
];

for (const version of matrix) {
  const cwd = join(runDirectory, `react-${version.react}`);
  mkdirSync(cwd);
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "react-modular-di": `file:${tarball}`,
          react: version.react,
          "react-dom": version.react,
          tsyringe: "4.10.0",
          jsdom: "26.1.0",
        },
        devDependencies: {
          typescript: "5.9.3",
          "@types/node": "22.20.5",
          "@types/react": version.reactTypes,
          "@types/react-dom": version.domTypes,
        },
      },
      null,
      2,
    ),
  );
  execFileSync(npm, ["install", "--dry-run=false", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd,
    stdio: "inherit",
  });
  copyFileSync(join(project, "tests/consumer.tsx"), join(cwd, "consumer.tsx"));
  execFileSync(
    process.execPath,
    [
      join(cwd, "node_modules/typescript/bin/tsc"),
      "consumer.tsx",
      "--outDir",
      "compiled",
      "--strict",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--jsx",
      "react-jsx",
      "--experimentalDecorators",
      "--emitDecoratorMetadata",
    ],
    { cwd, stdio: "inherit" },
  );
  execFileSync(process.execPath, ["compiled/consumer.js"], { cwd, stdio: "inherit" });

  for (const name of ["module.test.js", "react.test.js"]) {
    const compiled = readFileSync(join(project, ".test-dist/tests", name), "utf8")
      .replaceAll('"../src/index.js"', '"react-modular-di"')
      .replaceAll('"../src/react.js"', '"react-modular-di/react"');
    writeFileSync(join(cwd, name), compiled);
  }
  execFileSync(process.execPath, ["--test", "module.test.js", "react.test.js"], {
    cwd,
    stdio: "inherit",
  });
  console.log(`Installed tarball verified with React ${version.react}`);
}

console.log(`Tarball: ${tarball}`);
