const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('asset libraries paginate large collections without rendering every thumbnail', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const runtime = await fs.readFile(path.join(__dirname, '../src/runtime.js'), 'utf8');
  const management = renderer.match(/function renderAssetManagementGrid\(\)[\s\S]*?\n\}/)?.[0] || '';
  const picker = renderer.match(/function renderAssets\(type\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderer, /const ASSET_PAGE_SIZE = 100/);
  assert.match(renderer, /function assetPaginationHtml/);
  assert.match(renderer, /data-asset-page-select/);
  assert.match(renderer, /共 \$\{formatInteger\(count\)\} 张/);
  assert.match(management, /slice\(start, start \+ ASSET_PAGE_SIZE\)/);
  assert.match(management, /assetPaginationHtml\(`management:/);
  assert.match(picker, /slice\(start, start \+ ASSET_PAGE_SIZE\)/);
  assert.match(picker, /assetPaginationHtml\(type/);
  assert.match(renderer, /全选本页/);
  assert.doesNotMatch(management, /slice\(0, 160\)/);
  assert.doesNotMatch(picker, /slice\(0, 240\)/);
  assert.match(runtime, /async function scanImages\(root, query = '', limit = 10000\)/);
});
