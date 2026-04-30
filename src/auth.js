'use strict';

const PaytmChecksum = require('./checksum');
const { buildUrl } = require('./utils');

const testAuth = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;

  if (Buffer.byteLength(keySecret, 'utf8') !== 16) {
    throw new z.errors.Error(
      `Paytm Key Secret must be exactly 16 bytes for AES-128-CBC. ` +
      `Received ${Buffer.byteLength(keySecret, 'utf8')} bytes. ` +
      `Check your credentials and try again.`
    );
  }

  const mid = bundle.authData.merchantId;
  const body = {
    mid,
    fromDate: '2024-01-01T00:00:00+05:30',
    toDate: '2024-01-01T23:59:59+05:30',
    orderSearchType: 'ALL',
    orderSearchStatus: 'SUCCESS',
    pageNumber: 1,
    pageSize: 1,
    isSort: true,
  };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(
    bundle.authData.environment,
    '/merchant-passbook/search/list/order/v2'
  );

  // HTTP 200 = credentials are valid, even if resultCode signals no data
  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status !== 200) {
    throw new z.errors.Error(
      `Paytm API returned HTTP ${response.status}. ` +
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
      helpText: 'Your Paytm Merchant ID (MID). Found in your Paytm dashboard.',
    },
    {
      key: 'keySecret',
      label: 'Key Secret',
      required: true,
      type: 'password',
      helpText:
        'Your Paytm Key Secret used for AES-128-CBC request signing. ' +
        'Must be exactly 16 bytes.',
    },
    {
      key: 'environment',
      label: 'Environment',
      required: true,
      type: 'string',
      choices: ['production', 'staging'],
      default: 'production',
      helpText:
        'Use "Staging" for testing with a stage MID. Switch to "Production" for live transactions.',
    },
  ],
  test: testAuth,
  connectionLabel: '{{bundle.authData.merchantId}} ({{bundle.authData.environment}})',
};

module.exports = authentication;
