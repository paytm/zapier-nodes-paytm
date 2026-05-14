'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const subsId = trimStr(bundle.inputData.subsId);
  if (!subsId) throw new z.errors.Error('Subscription ID is required.');

  const status = bundle.inputData.status;
  if (status !== 'SUSPENDED' && status !== 'ACTIVE') {
    throw new z.errors.Error('Status must be SUSPENDED or ACTIVE.');
  }

  const body = { mid, subsId, status };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/subscription/subscription/status/modify');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  return [{ id: subsId, subsId, requestedStatus: status, ...resultBody }];
};

module.exports = {
  key: 'pause_resume_subscription',
  noun: 'Subscription',
  display: {
    label: 'Pause or Resume Subscription',
    description: 'Pause or resume an active subscription.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'subsId',
        label: 'Subscription ID',
        type: 'string',
        required: true,
        helpText: 'Subscription ID to update.',
      },
      {
        key: 'status',
        label: 'Target status',
        type: 'string',
        required: true,
        choices: { SUSPENDED: 'Suspended', ACTIVE: 'Active' },
        default: 'SUSPENDED',
        helpText: 'Status to which the subscription should be updated.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'subsId', label: 'Subscription ID' },
      { key: 'requestedStatus', label: 'Requested Status' },
      { key: 'resultCode', label: 'Result Code' },
      { key: 'resultStatus', label: 'Result Status' },
      { key: 'resultMsg', label: 'Result Message' },
    ],
    sample: {
      id: 'SUBS12345',
      subsId: 'SUBS12345',
      requestedStatus: 'SUSPENDED',
      resultCode: '0000',
      resultStatus: 'SUCCESS',
    },
  },
};
