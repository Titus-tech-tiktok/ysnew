const DEFAULT_TIMEOUT_MS = 12_000;

function apiRoot(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/v1(?:beta)?$/i, '');
}

function providerHint(relay = {}) {
  const root = apiRoot(relay.baseUrl).toLowerCase();
  if (root.includes('change2pro.com')) return 'sub2api';
  if (root.includes('klong.lat') || String(relay.balanceAccessToken || '').trim()) return 'newapi';
  return '';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function requestJson(url, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  try {
    const headers = { Accept: 'application/json' };
    if (String(token || '').trim()) headers.Authorization = `Bearer ${token}`;
    if (options.userId) headers['New-Api-User'] = String(options.userId);
    const response = await (options.fetchImpl || fetch)(url, { headers, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function safeHttpMessage(result, label = '余额') {
  const status = Number(result?.status) || 0;
  if ([401, 403].includes(status)) return `${label}认证失败（HTTP ${status}）`;
  if (status === 404) return `${label}接口不可用（HTTP 404）`;
  if (status === 429) return `${label}请求过于频繁（HTTP 429）`;
  if (status >= 500) return `${label}服务暂时不可用（HTTP ${status}）`;
  return `${label}查询失败${status ? `（HTTP ${status}）` : ''}`;
}

function newApiDisplayedBalance(quota, statusBody = {}) {
  const settings = statusBody?.data || statusBody || {};
  const quotaPerUnit = finiteNumber(settings.quota_per_unit);
  if (quotaPerUnit == null || quotaPerUnit <= 0) return null;
  const displayType = String(settings.quota_display_type || 'USD').toUpperCase();
  if (displayType === 'TOKENS') return { balance: quota, currency: 'TOKENS' };
  if (displayType === 'CNY') {
    return {
      balance: (quota / quotaPerUnit) * (finiteNumber(settings.usd_exchange_rate) || 1),
      currency: 'CNY'
    };
  }
  return { balance: quota / quotaPerUnit, currency: 'USD' };
}

async function querySub2Api(relay, options = {}) {
  const result = await requestJson(`${apiRoot(relay.baseUrl)}/v1/usage`, relay.imageKey, options);
  if (!result.ok) return result.status === 404 ? null : {
    provider: 'sub2api', source: 'wallet', status: 'error', error: 'wallet_request_failed',
    message: safeHttpMessage(result, '钱包余额')
  };
  const balance = finiteNumber(result.body?.remaining ?? result.body?.balance);
  if (balance == null) return {
    provider: 'sub2api', source: 'wallet', status: 'error', error: 'invalid_wallet_response',
    message: '钱包接口没有返回有效余额'
  };
  return {
    provider: 'sub2api', source: 'wallet', status: 'ok', balance, currency: 'USD',
    message: String(result.body?.planName || '钱包余额')
  };
}

async function queryNewApiAccount(relay, options = {}) {
  const root = apiRoot(relay.baseUrl);
  const accessToken = String(relay.balanceAccessToken || '').trim();
  if (!accessToken) return null;
  const [profile, status] = await Promise.all([
    requestJson(`${root}/api/user/self`, accessToken, { ...options, userId: relay.balanceUserId }),
    requestJson(`${root}/api/status`, '', options)
  ]);
  if (!profile.ok || profile.body?.success === false) {
    return {
      provider: 'newapi', source: 'account', status: 'error',
      error: 'account_request_failed',
      message: safeHttpMessage(profile, '站点访问令牌')
    };
  }
  const quota = finiteNumber(profile.body?.data?.quota);
  if (quota == null) {
    return {
      provider: 'newapi', source: 'account', status: 'error', error: 'missing_account_quota',
      message: '站点没有返回账户余额字段'
    };
  }
  if (!status.ok || status.body?.success === false) {
    return {
      provider: 'newapi', source: 'account', status: 'error', error: 'status_request_failed',
      message: safeHttpMessage(status, '站点配额配置')
    };
  }
  const displayed = newApiDisplayedBalance(quota, status.body);
  if (!displayed) {
    return {
      provider: 'newapi', source: 'account', status: 'error', error: 'invalid_quota_per_unit',
      message: '站点没有返回有效的 quota_per_unit'
    };
  }
  return {
    provider: 'newapi', source: 'account', status: 'ok',
    ...displayed, message: 'New API 账户余额'
  };
}

async function detectNewApi(relay, options = {}) {
  const result = await requestJson(`${apiRoot(relay.baseUrl)}/api/usage/token/`, relay.imageKey, options);
  if (!result.ok || result.body?.code !== true || result.body?.data?.object !== 'token_usage') return null;
  return {
    provider: 'newapi', source: 'token', status: 'needs_credentials',
    error: 'balance_access_token_required',
    message: result.body.data.unlimited_quota
      ? '当前调用密钥为无限额度，不能代表站点余额；请在 API 设置中填写站点访问令牌'
      : '这里只能读到密钥额度，不能确保等于站点账户余额；请在 API 设置中填写站点访问令牌'
  };
}

async function queryRelayBalance(relay, options = {}) {
  const hint = providerHint(relay);
  const base = {
    relayId: String(relay?.id || ''),
    relayName: String(relay?.name || relay?.id || '未命名中转站'),
    checkedAt: new Date().toISOString()
  };
  if (!relay?.enabled || !relay?.baseUrl || !relay?.imageKey) {
    return {
      ...base, provider: 'unknown', status: 'disabled', error: 'configuration_incomplete',
      message: '中转站未启用或接口配置不完整'
    };
  }
  try {
    if (hint === 'sub2api') {
      const sub2api = await querySub2Api(relay, options);
      return { ...base, ...(sub2api || {
        provider: 'sub2api', status: 'unsupported', error: 'wallet_endpoint_unavailable',
        message: '钱包余额接口不可用'
      }) };
    }
    if (hint === 'newapi') {
      const account = await queryNewApiAccount(relay, options);
      if (account) return { ...base, ...account };
      const detected = await detectNewApi(relay, options);
      return { ...base, ...(detected || {
        provider: 'newapi', source: 'account', status: 'needs_credentials',
        error: 'balance_access_token_required',
        message: '请在 API 设置中填写站点访问令牌'
      }) };
    }
    const sub2api = await querySub2Api(relay, options);
    if (sub2api) return { ...base, ...sub2api };
    const account = await queryNewApiAccount(relay, options);
    if (account) return { ...base, ...account };
    const newapi = await detectNewApi(relay, options);
    if (newapi) return { ...base, ...newapi };
    return {
      ...base, provider: 'unknown', status: 'unsupported', error: 'unsupported_provider',
      message: '站点未提供可识别的余额查询接口'
    };
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
      || error?.name === 'TimeoutError'
      || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
    return {
      ...base, provider: hint || 'unknown', status: 'error', error: timedOut ? 'timeout' : 'network_error',
      message: timedOut ? '余额查询超时' : '余额查询网络异常'
    };
  }
}

async function queryRelayBalances(relays = [], options = {}) {
  return Promise.all((Array.isArray(relays) ? relays : []).map(relay => queryRelayBalance(relay, options)));
}

module.exports = { apiRoot, newApiDisplayedBalance, queryRelayBalance, queryRelayBalances };
