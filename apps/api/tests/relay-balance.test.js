const test = require('node:test');
const assert = require('node:assert/strict');
const { apiRoot, queryRelayBalance, queryRelayBalances } = require('../src/relay-balance');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function relay(overrides = {}) {
  return {
    id: 'primary', name: '主中转站', enabled: true,
    baseUrl: 'https://relay.example/v1', imageKey: 'sk-image',
    ...overrides
  };
}

test('Sub2API uses the existing image key to read wallet balance', async () => {
  const calls = [];
  const result = await queryRelayBalance(relay(), {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.Authorization });
      return json({ mode: 'unrestricted', planName: '钱包余额', balance: 212.45147134, remaining: 212.45147134 });
    }
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.provider, 'sub2api');
  assert.equal(result.balance, 212.45147134);
  assert.equal(result.currency, 'USD');
  assert.deepEqual(calls, [{ url: 'https://relay.example/v1/usage', authorization: 'Bearer sk-image' }]);
});

test('Sub2API falls back to balance and strips a trailing v1 from the site root', async () => {
  assert.equal(apiRoot('https://relay.example/v1/'), 'https://relay.example');
  const result = await queryRelayBalance(relay({ baseUrl: 'https://api.change2pro.com/v1/' }), {
    fetchImpl: async url => {
      assert.equal(String(url), 'https://api.change2pro.com/v1/usage');
      return json({ balance: 18.75 });
    }
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.balance, 18.75);
});

test('New API unlimited image key asks for an account access token instead of showing a fake balance', async () => {
  const result = await queryRelayBalance(relay(), {
    fetchImpl: async url => String(url).endsWith('/v1/usage')
      ? json({ message: 'Invalid URL' }, 404)
      : json({ code: true, message: 'ok', data: { object: 'token_usage', unlimited_quota: true } })
  });
  assert.equal(result.provider, 'newapi');
  assert.equal(result.status, 'needs_credentials');
  assert.match(result.message, /无限额度/);
  assert.equal(Object.hasOwn(result, 'balance'), false);
});

test('New API account access token reads user quota and converts it with public site settings', async () => {
  const calls = [];
  const result = await queryRelayBalance(relay({ balanceAccessToken: 'account-token', balanceUserId: '7' }), {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.Authorization, userId: options.headers['New-Api-User'] });
      if (String(url).endsWith('/api/status')) {
        return json({ success: true, data: { quota_display_type: 'USD', quota_per_unit: 500000 } });
      }
      return json({ success: true, data: { quota: 106225000 } });
    }
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.provider, 'newapi');
  assert.equal(result.balance, 212.45);
  assert.equal(result.currency, 'USD');
  assert.equal(calls.length, 2);
  assert.equal(calls.find(call => call.url.endsWith('/api/user/self')).authorization, 'Bearer account-token');
  assert.equal(calls.find(call => call.url.endsWith('/api/status')).authorization, undefined);
  assert.equal(calls.find(call => call.url.endsWith('/api/user/self')).userId, '7');
});

test('New API refuses to invent a balance when quota_per_unit is unavailable', async () => {
  const result = await queryRelayBalance(relay({
    baseUrl: 'https://api.klong.lat/v1', balanceAccessToken: 'account-token'
  }), {
    fetchImpl: async url => String(url).endsWith('/api/status')
      ? json({ success: true, data: {} })
      : json({ success: true, data: { quota: 21_895_000 } })
  });
  assert.equal(result.provider, 'newapi');
  assert.equal(result.status, 'error');
  assert.equal(Object.hasOwn(result, 'balance'), false);
  assert.match(result.message, /quota_per_unit/);
});

test('one relay failure stays isolated and upstream error bodies cannot leak credentials', async () => {
  const secret = 'do-not-leak-this-token';
  const results = await queryRelayBalances([
    relay({ id: 'failed', baseUrl: 'https://api.klong.lat/v1', balanceAccessToken: secret }),
    relay({ id: 'healthy', baseUrl: 'https://api.change2pro.com/v1' })
  ], {
    fetchImpl: async url => String(url).includes('klong.lat')
      ? json({ success: false, message: `invalid ${secret}` }, 401)
      : json({ remaining: 42.5 })
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'error');
  assert.equal(results[0].error, 'account_request_failed');
  assert.doesNotMatch(JSON.stringify(results[0]), new RegExp(secret));
  assert.equal(results[1].status, 'ok');
  assert.equal(results[1].balance, 42.5);
});
