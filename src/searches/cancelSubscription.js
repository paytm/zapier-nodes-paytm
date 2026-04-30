'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const subsId = trimStr(bundle.inputData.subsId);
  if (!subsId) throw new z.errors.Error('Subscription ID is required.');

  const body = { mid, subsId };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/subscription/subscription/cancel');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  return [{ id: subsId, subsId, ...resultBody }];
};

module.exports = {
  key: 'cancelSubscription',
  noun: 'Subscription',
  display: {
    label: 'Cancel Subscription',
    description: 'Permanently cancels a Paytm subscription. This action cannot be undone.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'subsId',
        label: 'Subscription ID',
        type: 'string',
        required: true,
        helpText: 'The Paytm subscription ID to cancel.',
      },
    ],
    perform,
    sample: {
      id: 'SUBS12345',
      subsId: 'SUBS12345',
      resultCode: '0000',
      resultStatus: 'SUCCESS',
      resultMsg: 'Success',
    },
  },
};
