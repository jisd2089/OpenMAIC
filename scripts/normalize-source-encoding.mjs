import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_FILES = ['app/page.tsx', path.join('app', 'classroom', '[id]', 'page.tsx')];

const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
const lossyDecoder = new TextDecoder('utf-8');

function normalizeText(buffer, relativePath) {
  const hasUtf8Bom =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const input = hasUtf8Bom ? buffer.subarray(3) : buffer;

  let text = '';
  let replacedInvalidUtf8 = false;
  try {
    text = fatalDecoder.decode(input);
  } catch {
    text = lossyDecoder.decode(input);
    replacedInvalidUtf8 = true;
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  const changed = hasUtf8Bom || replacedInvalidUtf8 || normalized !== text;

  if (replacedInvalidUtf8) {
    console.warn(`[normalize-source-encoding] Replaced invalid UTF-8 bytes in ${relativePath}`);
  }

  return { changed, content: normalized };
}

async function main() {
  let rewrittenCount = 0;
  for (const relativePath of TARGET_FILES) {
    const fullPath = path.join(ROOT, relativePath);
    const buffer = await fs.readFile(fullPath);
    const { changed, content } = normalizeText(buffer, relativePath);
    if (!changed) continue;

    await fs.writeFile(fullPath, content, 'utf8');
    rewrittenCount += 1;
  }

  if (rewrittenCount > 0) {
    console.log(`[normalize-source-encoding] Rewrote ${rewrittenCount} file(s) to UTF-8/LF`);
  }
}

await main();
