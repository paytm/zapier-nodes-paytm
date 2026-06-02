'use strict';

const PaytmChecksum = require('./checksum');
const { buildUrl } = require('./utils');

/** Same credential probe as [n8n-nodes-paytm](https://github.com/paytm/n8n-nodes-paytm): `POST /link/fetch` with `{ mid }` only — Paytm reliably surfaces bad keys vs bad MID in `resultInfo`. */
const LINK_FETCH_PATH = '/link/fetch';

const safeParseJson = (raw) => {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

/**
 * Normalizes Paytm envelope `{ body: { resultInfo } }` or stringified `body`.
 */
const unwrapPaytmResponse = (data) => {
  if (!data || typeof data !== 'object') return { blob: null, resultInfo: null };
  let inner = null;
  if (data.body != null && typeof data.body === 'object') {
    inner = data.body;
  } else if (typeof data.body === 'string') {
    inner = safeParseJson(data.body);
  }
  const blob = inner && typeof inner === 'object' ? inner : data;
  const resultInfo =
    blob && typeof blob === 'object' && blob.resultInfo && typeof blob.resultInfo === 'object'
      ? blob.resultInfo
      : null;
  return { blob, resultInfo };
};

/** Mirrors n8n `PaytmApi.credentials.ts` test rules — Paytm answers HTTP 200 with these messages when MID/key/env don't match. */
const CREDENTIAL_FAILURE_MESSAGE_RES = [
  /checksum\s+provided\s+is\s+invalid/i,
  /error\s+while\s+fetching\s+merchant\s+preference\s+detail/i,
];

const combinedResultMessage = (resultInfo) => {
  if (!resultInfo || typeof resultInfo !== 'object') return '';
  const parts = [resultInfo.resultMsg, resultInfo.resultMessage].filter(
    (x) => x != null && String(x).trim() !== ''
  );
  return parts.map((x) => String(x)).join(' ').trim();
};

const testAuth = async (z, bundle) => {
  const keySecretRaw = bundle.authData.keySecret;
  const midRaw = bundle.authData.merchantId;

  const keySecret = typeof keySecretRaw === 'string' ? keySecretRaw.trim() : '';
  const mid = typeof midRaw === 'string' ? midRaw.trim() : '';

  if (!mid || !keySecret) {
    throw new z.errors.Error(
      'Merchant ID and Key Secret are required to test this connection.'
    );
  }

  if (Buffer.byteLength(keySecret, 'utf8') !== 16) {
    throw new z.errors.Error(
      `Paytm Key Secret must be exactly 16 bytes for AES-128-CBC. ` +
        `Received ${Buffer.byteLength(keySecret, 'utf8')} bytes. ` +
        `Check your credentials and try again.`
    );
  }

  const body = { mid };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, LINK_FETCH_PATH);

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new z.errors.Error(
      `Paytm API returned HTTP ${response.status}. ` +
        `Verify your Merchant ID, Key Secret, and environment selection.`
    );
  }

  let data = response.json != null ? response.json : response.data;
  if (data == null && typeof response.content === 'string') {
    data = safeParseJson(response.content);
  }
  data = data || {};

  const { resultInfo } = unwrapPaytmResponse(data);

  const msg = combinedResultMessage(resultInfo);

  if (CREDENTIAL_FAILURE_MESSAGE_RES.some((re) => re.test(msg))) {
    throw new z.errors.Error(
      `Paytm rejected these credentials (${msg || 'checksum or merchant mismatch'}). ` +
        `Verify your Merchant ID and Key Secret pair on ` +
        `[Paytm Dashboard → API Keys](https://dashboard.paytmpayments.com/next/apikeys) ` +
        `and that **Environment** matches where this MID was issued (staging vs production).`
    );
  }

  if (!resultInfo || typeof resultInfo !== 'object') {
    throw new z.errors.Error(
      `Unexpected Paytm response shape during auth test (no resultInfo). ` +
        `Cannot confirm credentials.`
    );
  }

  const status = String(resultInfo.resultStatus || '').toUpperCase();
  const code = String(resultInfo.resultCode ?? '').trim();

  const isSuccess =
    status === 'S' ||
    status === 'SUCCESS' ||
    code === '0000';

  if (!isSuccess) {
    throw new z.errors.Error(
      `Paytm rejected the credentials. ` +
        `resultCode=${code || 'n/a'} resultStatus="${status || 'n/a'}" ` +
        `resultMsg="${msg || 'unknown'}". ` +
        `Verify your Merchant ID, Key Secret, and environment selection.`
    );
  }

  return { merchantId: mid, environment: bundle.authData.environment };
};

const authentication = {
  type: 'custom',
  fields: [
    {
      key: 'merchantId',
      label: 'Merchant ID',
      required: true,
      type: 'string',
      helpText:
        'Your Paytm Merchant ID (MID). ' +
        '[Get your Paytm MID and API Key](https://www.paytmpayments.com/docs/getting-started)',
      helpUrl: 'https://dashboard.paytmpayments.com/next/apikeys',
    },
    {
      key: 'keySecret',
      label: 'Key Secret',
      required: true,
      type: 'password',
      helpText:
        'API Key available on merchant dashboard. ' +
        '[Get your Paytm MID and API Key](https://www.paytmpayments.com/docs/getting-started)',
      helpUrl: 'https://dashboard.paytmpayments.com/next/apikeys',
    },
    {
      key: 'environment',
      label: 'Environment',
      required: true,
      type: 'string',
      choices: ['production', 'staging'],
      default: 'production',
      helpText:
        'Production for actual payments, test environment for workflow validations',
    },
  ],
  test: testAuth,
  connectionLabel: '{{bundle.authData.merchantId}}',
};

module.exports = authentication;
