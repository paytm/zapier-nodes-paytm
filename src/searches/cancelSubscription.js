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
  key: 'cancel_subscription',
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
        helpText: 'Subscription ID to cancel',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'subsId', label: 'Subscription ID' },
      { key: 'resultCode', label: 'Result Code' },
      { key: 'resultStatus', label: 'Result Status' },
      { key: 'resultMsg', label: 'Result Message' },
    ],
    sample: {
      id: 'SUBS12345',
      subsId: 'SUBS12345',
      resultCode: '0000',
      resultStatus: 'SUCCESS',
      resultMsg: 'Success',
    },
  },
};
