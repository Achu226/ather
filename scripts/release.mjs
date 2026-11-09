// Publish the built installer as a GitHub release; installed copies of Maya then update themselves.
// Usage: bump "version" in package.json, run `npm run dist`, then `npm run release -- "What changed"`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const { owner, repo } = pkg.build.publish;
const v = pkg.version;
const files = [`release/Maya-Setup-${v}.exe`, `release/Maya-Setup-${v}.exe.blockmap`, 'release/latest.yml'];
const missing = files.filter((f) => !existsSync(f));
if (missing.length) throw new Error(`Build first (npm run dist). Missing: ${missing.join(', ')}`);
if (!readFileSync('release/latest.yml', 'utf8').includes(`version: ${v}`)) throw new Error('release/latest.yml is from another version; run npm run dist again.');

const gh = process.env.GH_PATH || 'C:\\Program Files\\GitHub CLI\\gh.exe';
const notes = process.argv[2] || `Maya ${v}`;
// The share zip (start.bat + installer) goes up too when it was built (node scripts/make-share.mjs).
const share = `release/Maya-${v}-share.zip`;
execFileSync(gh, ['release', 'create', `v${v}`, ...files, ...(existsSync(share) ? [share] : []), '--repo', `${owner}/${repo}`, '--title', `Maya ${v}`, '--notes', notes, '--latest'], { stdio: 'inherit' });
console.log(`Published https://github.com/${owner}/${repo}/releases/tag/v${v}`);
