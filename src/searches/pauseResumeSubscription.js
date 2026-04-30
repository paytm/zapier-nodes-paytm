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
  key: 'pauseResumeSubscription',
  noun: 'Subscription Status',
  display: {
    label: 'Pause or Resume Subscription',
    description: 'Changes a Paytm subscription status to SUSPENDED (pause) or ACTIVE (resume).',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'subsId',
        label: 'Subscription ID',
        type: 'string',
        required: true,
        helpText: 'The Paytm subscription ID to pause or resume.',
      },
      {
        key: 'status',
        label: 'Target Status',
        type: 'string',
        required: true,
        choices: ['SUSPENDED', 'ACTIVE'],
        default: 'SUSPENDED',
        helpText: 'The status to move the subscription into.',
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
