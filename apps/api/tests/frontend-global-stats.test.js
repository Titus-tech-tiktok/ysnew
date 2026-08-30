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

test('mobile ledger uses one business selector and supports current and historical ranges', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';
  const loadBlock = renderer.match(/async function loadMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderBlock, /id="mobileFinanceBusiness"/);
  assert.match(renderBlock, /data-mobile-stats-range/);
  assert.match(renderBlock, /\{ key: 'yesterday', label: mobileText\('yesterday'\) \}/);
  assert.match(renderBlock, /\{ key: '7d', label: mobileText\('sevenDays'\) \}/);
  assert.match(renderBlock, /\{ key: 'month', label: mobileText\('thisMonth'\) \}/);
  assert.match(renderBlock, /\{ key: 'last_month', label: mobileText\('lastMonth'\) \}/);
  assert.match(renderBlock, /\{ key: 'year', label: mobileText\('thisYear'\) \}/);
  assert.match(renderBlock, /\{ key: 'last_year', label: mobileText\('lastYear'\) \}/);
  assert.doesNotMatch(renderBlock, /Account Ranking|费用流水|Average Cost|First-pass success/);
  assert.match(loadBlock, /getBusinessHubOverview/);
  assert.match(loadBlock, /mobileFinanceRangeRequest/);
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
  assert.match(renderBlock, /mobileText\('teamBalance'\)/);
  assert.match(renderBlock, /mobileText\('realRelayBalance'\)/);
  assert.match(renderBlock, /hub\.upstreamBalances/);
  assert.match(renderBlock, /mobileText\('lowBalanceHint'\)/);
});

test('mobile ledger switches Chinese and English and hides relay wallets with ledger details', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderer, /mobileStatsLanguage: loadMobileStatsLanguage\(\)/);
  assert.match(renderer, /id="mobileStatsLanguageButton"/);
  assert.match(renderer, /state\.mobileStatsLanguage === 'zh' \? 'en' : 'zh'/);
  assert.match(renderer, /ledgerTitle: 'Business Ledger'/);
  assert.match(renderer, /realRelayBalance: 'Real relay balance'/);
  assert.match(renderBlock, /state\.mobileFinanceExpanded \? `<div class="mobile-finance-expanded-content"><section class="mobile-upstream-balance-panel">/);
  assert.doesNotMatch(renderBlock, /<section class="mobile-upstream-balance-panel">[\s\S]*?<button class="mobile-finance-more"/);
});
