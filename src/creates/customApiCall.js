'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, buildSettlementEnvelope, trimStr } = require('../utils');

const ID_KEYS = ['orderId', 'txnId', 'refId', 'linkId', 'subsId', 'requestId', 'id'];

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const endpoint = trimStr(bundle.inputData.endpoint);
  if (!endpoint) throw new z.errors.Error('API Endpoint is required.');

  const requestBodyRaw = trimStr(bundle.inputData.requestBody);
  if (!requestBodyRaw) throw new z.errors.Error('Request Body is required.');

  let body;
  try {
    body = JSON.parse(requestBodyRaw);
  } catch (e) {
    throw new z.errors.Error('Request Body must be valid JSON (e.g. {"orderId":"ORDER123"}).');
  }

  const injectMerchant =
    bundle.inputData.injectMerchant !== false && bundle.inputData.injectMerchant !== 'false';
  if (injectMerchant) body.mid = mid;

  const signingScheme = bundle.inputData.signingScheme || 'standard';
  const url = buildUrl(bundle.authData.environment, endpoint);

  let response;

  if (signingScheme === 'settlement') {
    const outerEnvelope = buildSettlementEnvelope(mid, body);
    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(outerEnvelope),
      keySecret
    );
    response = await z.request({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json', signature },
      body: JSON.stringify(outerEnvelope),
    });
  } else {
    const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
    const payload = {
      body,
      head: { tokenType: 'AES', signature, channelId: 'WEB' },
    };
    response = await z.request({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  const data = response.json;
  const resultBody = (data.payload && data.payload.body) || data.body || data;

  const id =
    ID_KEYS.reduce((found, key) => found || resultBody[key], null) || Date.now().toString();

  return { id, endpoint, signingScheme, ...resultBody };
};

module.exports = {
  key: 'customApiCall',
  noun: 'API Response',
  display: {
    label: 'Custom API Call',
    hidden: true,
    description:
      'Makes a signed POST request to any Paytm API endpoint not covered by the predefined operations. AES-128-CBC signing is handled automatically.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'endpoint',
        label: 'API Endpoint',
        type: 'string',
        required: true,
        helpText:
          'Paytm API path e.g. /v2/refund/status. Do not include the base URL — it is set by your environment (staging/production).',
      },
      {
        key: 'requestBody',
        label: 'Request Body (JSON)',
        type: 'text',
        required: true,
        helpText:
          'JSON object of fields to send in the request body e.g. {"orderId":"ORDER123"}. Do not include "mid" — it is injected automatically.',
      },
      {
        key: 'injectMerchant',
        label: 'Auto-inject Merchant ID',
        type: 'boolean',
        default: 'true',
        required: false,
        helpText: 'When true, your MID is automatically added to the request body before signing.',
      },
      {
        key: 'signingScheme',
        label: 'Signing Scheme',
        type: 'string',
        required: true,
        choices: ['standard', 'settlement'],
        default: 'standard',
        helpText:
          'Standard: AES-CBC body envelope used by most Paytm APIs. Settlement: outer envelope with signature as HTTP header, used by settlement/reporting APIs.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'endpoint', label: 'Endpoint Called' },
      { key: 'signingScheme', label: 'Signing Scheme Used' },
      { key: 'resultCode', label: 'Result Code' },
      { key: 'resultStatus', label: 'Result Status' },
      { key: 'resultMsg', label: 'Result Message' },
    ],
    sample: {
      id: '1234567890',
      endpoint: '/v2/refund/status',
      signingScheme: 'standard',
      resultCode: '0000',
      resultStatus: 'SUCCESS',
      resultMsg: 'Success',
    },
  },
};
