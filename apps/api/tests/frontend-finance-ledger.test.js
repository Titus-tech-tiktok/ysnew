const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('mobile ledger keeps operating and cash-flow details collapsed behind More', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const panel = renderer.match(/function mobileFinancePanelHtml\(\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(renderer, /mobileFinanceExpanded: false/);
  assert.match(renderer, /id="mobileFinanceMore"/);
  assert.match(renderer, /state\.mobileFinanceExpanded \? '收起账本' : 'More'/);
  assert.match(panel, /if \(!state\.mobileFinanceExpanded\) return ''/);
  for (const label of ['客户到账', '已消费收入', '上游实际成本', '其他费用', '经营利润', '上游充值', '净现金流']) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /账本明细/);
});

test('mobile ledger filters businesses and separates operating profit from net cash flow', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const bridge = await fs.readFile(path.join(__dirname, '../../web/src/api-bridge.js'), 'utf8');
  const renderBlock = renderer.match(/function renderMobileStats\(\)[\s\S]*?\n\}/)?.[0] || '';
  const panel = renderer.match(/function mobileFinancePanelHtml\(\)[\s\S]*?\n\}/)?.[0] || '';

  for (const label of ['全部业务', '练锐', '永沙', '今天', '昨天', '近 7 天', '本月', '上月', '本年', '上年', '团队当前可用余额', '已消费收入', 'API 请求', '客户到账', '经营利润', '净现金流', '记一笔', '导出 CSV']) {
    assert.match(renderer, new RegExp(label));
  }
  assert.match(renderBlock, /id="mobileFinanceBusiness"/);
  assert.match(renderBlock, /ledgerTotals\.consumptionUsdMinor/);
  assert.match(renderBlock, /upstreamRequests\?\.count/);
  assert.match(renderer, /recognizedRevenueCnyMinor - upstreamActualCostCnyMinor - otherExpensesCnyMinor/);
  assert.match(renderer, /customerReceiptsCnyMinor - upstreamTopupsCnyMinor - otherExpensesCnyMinor/);
  assert.match(renderer, /title: '上游实际成本'/);
  assert.doesNotMatch(panel, /充值核验|客户充值 \+ 其他收入|上游成本 \+ 杂费/);
  assert.match(bridge, /includeRecharges === false/);
  assert.match(bridge, /\/api\/business-hub\/finance-entry-action/);
  assert.match(renderer, /saveBusinessFinanceEntry/);
});

test('ledger dialog records receipts, upstream topups and expenses for either business', async () => {
  const renderer = await fs.readFile(path.join(__dirname, '../../web/src/renderer.js'), 'utf8');
  const dialog = renderer.match(/function openMobileFinanceDialog\(entry = null\)[\s\S]*?\n\}/)?.[0] || '';

  assert.match(dialog, /data-finance-business/);
  assert.match(dialog, /计入业务/);
  assert.match(dialog, /availableBusinesses/);
  assert.match(dialog, /请选择账目计入的业务/);
  assert.match(dialog, /金额（CNY）/);
  assert.match(dialog, /data-finance-category/);
  assert.match(dialog, /client_payment/);
  assert.match(dialog, /gateway_topup/);
  assert.match(dialog, /other_expense/);
  assert.match(dialog, /currency: 'CNY'/);
  assert.match(dialog, /saveBusinessFinanceEntry/);
  assert.doesNotMatch(dialog, /推广费用|人工费用/);
});
