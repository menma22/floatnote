import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

assert.equal(process.platform, 'darwin', 'Inspect the bundle on macOS.');

const appPath = path.resolve(
  process.argv[2] || 'release/mac-universal/Floatnote.app',
);
const reportPath = path.resolve(
  process.argv[3] || 'release/mac-package-metadata.json',
);
const manifest = JSON.parse(await readFile('package.json', 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`,
  );
  return `${result.stdout}${result.stderr}`.trim();
}

function plist(file) {
  return JSON.parse(
    run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]),
  );
}

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (entry.isFile()) yield file;
  }
}

const appInfo = plist(path.join(appPath, 'Contents/Info.plist'));
const frameworkInfo = plist(
  path.join(
    appPath,
    'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist',
  ),
);
assert.equal(appInfo.CFBundleShortVersionString, manifest.version);
assert.equal(
  appInfo.LSMinimumSystemVersion,
  manifest.build.mac.minimumSystemVersion,
);
function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

const binaries = [];
const machOMagic = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
]);
for await (const file of files(appPath)) {
  const handle = await open(file, 'r');
  const header = Buffer.alloc(4);
  try {
    await handle.read(header, 0, 4, 0);
  } finally {
    await handle.close();
  }
  if (!machOMagic.has(header.toString('hex'))) continue;
  const architectures = run('/usr/bin/lipo', ['-archs', file])
    .split(/\s+/)
    .sort();
  assert.deepEqual(architectures, ['arm64', 'x86_64'], file);
  run('/usr/bin/codesign', ['--verify', '--strict', file]);
  const minimumSystemVersions = {};
  for (const architecture of architectures) {
    const build = run('/usr/bin/xcrun', [
      'vtool',
      '-arch',
      architecture,
      '-show-build',
      file,
    ]);
    const minimum = build.match(/^\s*(?:minos|version)\s+([\d.]+)\s*$/m)?.[1];
    assert.ok(minimum, `${file} ${architecture}: missing deployment target`);
    assert.ok(
      compareVersions(appInfo.LSMinimumSystemVersion, minimum) >= 0,
      `${file} ${architecture} requires macOS ${minimum}`,
    );
    minimumSystemVersions[architecture] = minimum;
  }
  binaries.push({
    path: path.relative(appPath, file),
    architectures,
    minimumSystemVersions,
  });
}
assert.ok(
  binaries.some((binary) => binary.path === 'Contents/MacOS/Floatnote'),
  'The main executable must be inspected.',
);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
const signature = run('/usr/bin/codesign', [
  '--display',
  '--verbose=4',
  appPath,
]);
assert.match(signature, /Signature=adhoc/);
assert.match(signature, /TeamIdentifier=not set/);
const electronFramework = binaries.find((binary) =>
  binary.path.endsWith(
    'Electron Framework.framework/Versions/A/Electron Framework',
  ),
);
assert.ok(electronFramework, 'The Electron framework must be inspected.');

const report = {
  version: manifest.version,
  electronVersion: manifest.devDependencies.electron,
  runner: {
    architecture: process.arch,
    macOS: run('/usr/bin/sw_vers', ['-productVersion']),
  },
  minimumSystemVersion: appInfo.LSMinimumSystemVersion,
  electronFrameworkPlistMinimumSystemVersion:
    frameworkInfo.LSMinimumSystemVersion || null,
  electronMinimumSystemVersions: electronFramework.minimumSystemVersions,
  signature: {
    kind: 'ad-hoc',
    developerId: false,
    notarized: false,
    details: signature,
  },
  binaries,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
