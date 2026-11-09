// Ready-made MCP servers. npx-based ones need Node.js on the PC (start.bat / install.bat install it).
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { modelsDir } from '../paths.js';
import { downloadFile } from '../ml/catalog.js';

const run = promisify(execFile);
const npx = (pkg, ...extra) => ({ command: 'cmd.exe', args: ['/c', 'npx', '-y', pkg, ...extra] });

/** A user folder where it really is: OneDrive moves Desktop and Documents to OneDrive\Desktop on many PCs. */
export function userFolder(name, home = process.env.USERPROFILE || '') {
  const plain = join(home, name), synced = join(home, 'OneDrive', name);
  return !existsSync(plain) && existsSync(synced) ? synced : plain;
}

/** Folders Maya may read and change (files tools and the Filesystem server). */
export function approvedFolders(store) {
  return store.getSetting('approvedFolders', [userFolder('Documents'), userFolder('Downloads'), userFolder('Desktop')]);
}

const githubDir = () => join(modelsDir, '..', 'mcp', 'github');
const githubExe = () => {
  const dir = githubDir();
  const f = existsSync(dir) && readdirSync(dir, { recursive: true }).find((x) => /github-mcp-server\.exe$/i.test(x));
  return f ? join(dir, f) : null;
};

export const GH = process.env.GH_PATH || 'C:\\Program Files\\GitHub CLI\\gh.exe';

export const MCP_PRESETS = {
  filesystem: {
    name: 'Filesystem', description: 'Read, search and edit files in your approved folders.',
    ...npx('@modelcontextprotocol/server-filesystem@2.0.1'), args: (store) => ['/c', 'npx', '-y', '@modelcontextprotocol/server-filesystem@2.0.1', ...approvedFolders(store)],
    keywords: ['file', 'folder', 'directory', 'project', 'source code', 'readme'], permission: 'auto',
  },
  github: {
    name: 'GitHub', description: 'Your repositories, issues and pull requests (official GitHub server, uses your GitHub CLI sign-in).',
    command: '(downloads on first connect)', args: ['stdio', '--toolsets', 'context,repos,issues,pull_requests,users'],
    keywords: ['github', 'repo', 'repository', 'issue', 'pull request', 'commit', 'branch'], permission: 'ask', install: 'github',
  },
  playwright: {
    name: 'Browser automation', description: 'Playwright: opens websites, clicks, fills forms and takes screenshots in its own browser.',
    ...npx('@playwright/mcp@0.0.83', '--browser', 'msedge'),
    keywords: ['browser', 'website', 'web page', 'webpage', 'click', 'form', 'navigate', 'playwright', 'log in to'], permission: 'auto',
  },
  context7: {
    name: 'Context7 docs', description: 'Current documentation for programming libraries (React, Node, Python…), fewer made-up APIs.',
    ...npx('@upstash/context7-mcp@4.4.4'),
    keywords: ['docs', 'documentation', 'library', 'api', 'react', 'node', 'python', 'electron', 'framework', 'how do i use'], permission: 'auto',
  },
  thinking: {
    name: 'Sequential thinking', description: 'Breaks hard problems into steps and revises the plan as it goes.',
    ...npx('@modelcontextprotocol/server-sequential-thinking@2.0.0'),
    keywords: ['step by step', 'think through', 'complex', 'plan this', 'reason'], permission: 'auto',
  },
};

/** Prepares a server before it starts: downloads the GitHub server and passes your GitHub sign-in to it. */
export async function resolveEnv(c) {
  if (c.install !== 'github') return {};
  if (!githubExe()) {
    await downloadFile('githubmcp');
  }
  c.command = githubExe();
  const { stdout } = await run(GH, ['auth', 'token'], { windowsHide: true }).catch(() => {
    throw new Error('Sign in to GitHub first: run "gh auth login" (the GitHub CLI), then Reconnect.');
  });
  return { GITHUB_PERSONAL_ACCESS_TOKEN: stdout.trim() };
}
