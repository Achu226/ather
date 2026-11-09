// Builds release/Maya-<version>-share.zip: start.bat + setup script + README + the Maya installer, for sharing with friends.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const setup = join('release', `Maya-Setup-${version}.exe`);
if (!existsSync(setup)) throw new Error(`${setup} is missing: run npm run dist first`);

const name = `Maya-${version}-share`;
const dir = join('release', name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
// cmd.exe and Notepad want Windows line endings.
for (const f of ['start.bat', 'MEMORY.md', 'README-FIRST.txt']) {
  writeFileSync(join(dir, f), readFileSync(join('share', f), 'utf8').replace(/\r?\n/g, '\r\n'));
}
copyFileSync(setup, join(dir, `Maya-Setup-${version}.exe`));

const zip = join('release', `${name}.zip`);
rmSync(zip, { force: true });
execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', `${name}.zip`, name], { cwd: 'release' });
console.log(`${zip}  ${(statSync(zip).size / 1e6).toFixed(0)} MB`);
