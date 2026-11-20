import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} must be valid PNG`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test('PWA manifest defines valid multi-viewport icons, shortcuts, and separate maskable assets', () => {
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.short_name.length <= 12, 'short_name must stay <= 12 characters');

  const iconEntries = manifest.icons as Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }>;

  assert.ok(iconEntries.some((i) => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(iconEntries.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(iconEntries.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  assert.ok(
    iconEntries.every((i) => i.purpose !== 'any maskable'),
    'Separate "any" and "maskable" icon purposes must not be combined'
  );

  for (const icon of iconEntries) {
    const absPath = path.resolve(process.cwd(), 'public', icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(absPath), `Missing manifest icon file: ${icon.src}`);
    if (icon.type === 'image/png' && /^\d+x\d+$/.test(icon.sizes)) {
      const [w, h] = icon.sizes.split('x').map(Number);
      const dims = readPngDimensions(absPath);
      assert.deepEqual(dims, { width: w, height: h }, `Dimension mismatch for ${icon.src}`);
    }
  }

  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 1);
  for (const shortcut of manifest.shortcuts) {
    assert.ok(Array.isArray(shortcut.icons) && shortcut.icons.length >= 1);
    for (const scIcon of shortcut.icons) {
      const absPath = path.resolve(process.cwd(), 'public', scIcon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(absPath), `Missing shortcut icon file: ${scIcon.src}`);
    }
  }
});

test('index.html favicon and Apple Touch icon links resolve to existing multi-viewport assets', () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const hrefMatches = Array.from(
    html.matchAll(/<link[^>]+rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"[^>]+href="([^"]+)"/g)
  ).map((m) => m[1]);

  assert.ok(hrefMatches.includes('/favicon.ico'));
  assert.ok(hrefMatches.includes('/icon.svg'));
  assert.ok(hrefMatches.includes('/favicon-16x16.png'));
  assert.ok(hrefMatches.includes('/favicon-32x32.png'));
  assert.ok(hrefMatches.includes('/favicon-48x48.png'));
  assert.ok(hrefMatches.includes('/favicon-96x96.png'));
  assert.ok(hrefMatches.includes('/apple-touch-icon.png'));
  assert.ok(hrefMatches.includes('/apple-touch-icon-167x167.png'));
  assert.ok(hrefMatches.includes('/apple-touch-icon-152x152.png'));
  assert.ok(hrefMatches.includes('/apple-touch-icon-120x120.png'));

  for (const href of hrefMatches) {
    const absPath = path.resolve(process.cwd(), 'public', href.replace(/^\//, ''));
    assert.ok(fs.existsSync(absPath), `Missing HTML head asset: ${href}`);
  }

  const icoStat = fs.statSync(path.resolve(process.cwd(), 'public/favicon.ico'));
  assert.ok(icoStat.size > 1000, 'favicon.ico should bundle multi-size icons');
});
