import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Same folder Electron uses for userData ("%APPDATA%\Ather"); ATHER_DATA lets tests use a temp dir.
export const dataDir = process.env.ATHER_DATA || join(process.env.APPDATA || process.env.HOME || '.', 'Ather');
export const modelsDir = process.env.ATHER_MODELS || join(dataDir, 'models');
export const imagesDir = join(dataDir, 'images');
// Windows' own tar (bsdtar): a GNU tar from Git earlier on PATH cannot read C:\ paths or write zips.
export const TAR = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

for (const dir of [dataDir, modelsDir, imagesDir]) mkdirSync(dir, { recursive: true });
