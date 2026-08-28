const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('mobile ledger displays USD balance and consumption with two decimals', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');

  assert.match(renderer, /function formatMobileStatsMoney\(minor = 0\)/);
  assert.match(renderer, /return `\$\$\{amount\.toFixed\(2\)\}`/);
  assert.match(renderer, /formatMobileStatsMoney\(ledgerTotals\.balanceUsdMinor\)/);
  assert.match(renderer, /formatMobileStatsMoney\(ledgerTotals\.consumptionUsdMinor\)/);
});

test('mobile ledger uses one business selector and four day ranges', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';
  const loadBlock = renderer.match(/async function loadMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderBlock, /id="mobileFinanceBusiness"/);
  assert.match(renderBlock, /data-mobile-stats-range/);
  assert.match(renderBlock, /\{ key: 'yesterday', label: '昨天' \}/);
  assert.match(renderBlock, /\{ key: '7d', label: '近 7 天' \}/);
  assert.match(renderBlock, /\{ key: 'month', label: '本月' \}/);
  assert.doesNotMatch(renderBlock, /Account Ranking|费用流水|Average Cost|First-pass success/);
  assert.match(loadBlock, /getBusinessHubOverview/);
  assert.match(loadBlock, /includeRecharges: false/);
  assert.doesNotMatch(loadBlock, /getGlobalStats/);
});

test('mobile ledger combines both business balances and request counts', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderer, /duoxiluka: '练锐'/);
  assert.match(renderBlock, /availableBusinesses\.reduce/);
  assert.match(renderBlock, /upstreamRequests\?\.count/);
  assert.match(renderBlock, /mobileFinanceLedgerTotals\(item\.accounting\)\.balanceUsdMinor/);
  assert.match(renderBlock, /团队当前可用余额/);
});
