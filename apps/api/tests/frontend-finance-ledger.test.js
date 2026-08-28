const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('mobile ledger keeps income, profit and details collapsed behind More', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const panel = renderer.match(/function mobileFinancePanelHtml\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderer, /mobileFinanceExpanded: false/);
  assert.match(renderer, /id="mobileFinanceMore"/);
  assert.match(renderer, /state\.mobileFinanceExpanded \? '收起账本' : 'More'/);
  assert.match(panel, /if \(!state\.mobileFinanceExpanded\) return ''/);
  assert.match(panel, /手工收入/);
  assert.match(panel, /预估利润/);
  assert.match(panel, /账本明细/);
});

test('mobile ledger filters businesses and uses manual income minus actual API consumption', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const bridge = await fs.readFile(path.join(__dirname, '../../web/src/api-bridge.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';
  const panel = renderer.match(/function mobileFinancePanelHtml\(\)[\s\S]*?\n\}/)?.[0] || '';

  for (const label of ['全部业务', '练锐', '永沙', '今天', '昨天', '近 7 天', '本月', '团队当前可用余额', '实际消耗', 'API 请求', '手工收入', '预估利润', '记收入', '导出 CSV']) {
    assert.match(renderer, new RegExp(label));
  }
  assert.match(renderBlock, /id="mobileFinanceBusiness"/);
  assert.match(renderBlock, /ledgerTotals\.consumptionUsdMinor/);
  assert.match(renderBlock, /upstreamRequests\?\.count/);
  assert.match(renderer, /manualIncomeCnyMinor - actualConsumptionCnyMinor/);
  assert.match(renderer, /entry\.category !== 'other_income'/);
  assert.match(renderer, /title: 'API 实际消耗'/);
  assert.doesNotMatch(panel, /充值核验|客户充值 \+ 其他收入|上游成本 \+ 杂费/);
  assert.match(bridge, /includeRecharges === false/);
  assert.match(bridge, /\/api\/business-hub\/finance-entry-action/);
  assert.match(renderer, /saveBusinessFinanceEntry/);
});

test('income dialog records manual income and lets the all-business view choose its target', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const dialog = renderer.match(/function openMobileFinanceDialog\(entry = null\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(dialog, /data-finance-business/);
  assert.match(dialog, /计入业务/);
  assert.match(dialog, /availableBusinesses/);
  assert.match(dialog, /请选择收入计入的业务/);
  assert.match(dialog, /收入金额（CNY）/);
  assert.match(dialog, /category: 'other_income'/);
  assert.match(dialog, /currency: 'CNY'/);
  assert.match(dialog, /saveBusinessFinanceEntry/);
  assert.doesNotMatch(dialog, /推广费用|人工费用|上游充值/);
});
