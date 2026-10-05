// Serves Google Fonts to headless Chromium through curl (which honours the machine's proxy and CA
// settings), so renders use the real Cinzel/Oxanium faces even where the browser can't reach them.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

export async function serveGoogleFonts(context, cacheDir = join(process.env.TMPDIR || tmpdir(), 'soulswarm-font-cache')) {
  mkdirSync(cacheDir, { recursive: true });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    const file = join(cacheDir, createHash('sha1').update(url).digest('hex'));
    try {
      if (!existsSync(file)) execFileSync('curl', ['-sSfL', '-A', UA, url, '-o', file], { timeout: 20000 });
      const css = url.includes('googleapis');
      await route.fulfill({ status: 200, body: readFileSync(file), contentType: css ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } });
    } catch (e) {
      await route.abort();
    }
  });
}
