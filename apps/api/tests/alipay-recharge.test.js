const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createBillingService } = require('../src/billing');
const { createAlipayRechargeService } = require('../src/alipay-recharge');

test('Alipay 提交校验订单号，审核金额可修正且重复审核不重复入账', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'caishen-alipay-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const billing = createBillingService(root);
  const recharge = createAlipayRechargeService(root, billing);
  await fs.mkdir(path.dirname(recharge.qrFile), { recursive: true });
  await fs.writeFile(recharge.qrFile, 'test');
  await recharge.saveSettings({ enabled: true, payeeName: '测试收款方' });
  await billing.adjustBalance('workspace-admin', 'relay-one', 30_000_000, { description: '初始余额' });

  await assert.rejects(
    recharge.createOrder({ amountUsd: '100.001', alipayOrderNo: '20260827000000000001' }, context()),
    /最多保留两位小数/
  );
  await assert.rejects(
    recharge.createOrder({ amountUsd: '100.00', alipayOrderNo: '错误订单号' }, context()),
    /正确的支付宝订单号/
  );

  const submitted = await recharge.createOrder({ amountUsd: '100.00', alipayOrderNo: '20260827000000000001' }, context());
  assert.equal(submitted.requestedCreditMinor, 100_000_000);
  assert.equal(submitted.requestedPaymentCnyCents, 70_000);
  assert.equal(submitted.relayId, undefined);
  assert.equal(submitted.serviceName, '服务一');
  await assert.rejects(
    recharge.createOrder({ amountUsd: '100.00', alipayOrderNo: '20260827000000000001' }, context()),
    /已经提交/
  );

  await billing.adjustBalance('workspace-admin', 'relay-one', -10_000_000, { description: '期间消费' });
  const approved = await recharge.approve(submitted.id, { actualAmountUsd: '10.00' }, 'reviewer');
  assert.equal(approved.creditMinor, 10_000_000);
  assert.equal(approved.paymentCnyCents, 7_000);
  const onceMore = await recharge.approve(submitted.id, { actualAmountUsd: '999.00' }, 'reviewer');
  assert.equal(onceMore.creditMinor, 10_000_000);
  const summary = await billing.getSummary('workspace-admin', 'relay-one');
  assert.equal(summary.account.balanceMinor, 30_000_000);
  assert.equal(summary.transactions.filter(entry => entry.description === 'Alipay 充值到账').length, 1);

  function context() {
    return {
      userId: 'admin-user', workspaceId: 'workspace-admin', username: 'admin', displayName: '客户',
      relayId: 'relay-one', relayName: '服务一'
    };
  }
});

test('Alipay 未上传收款码时不能启用', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'caishen-alipay-empty-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const recharge = createAlipayRechargeService(root, createBillingService(root));
  await assert.rejects(recharge.saveSettings({ enabled: true }), /先上传支付宝收款码/);
});
