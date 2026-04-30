'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const subsId = trimStr(bundle.inputData.subsId);
  const orderId = trimStr(bundle.inputData.orderId);
  const linkId = trimStr(bundle.inputData.linkId);
  const custId = trimStr(bundle.inputData.custId);

  if (!subsId && !orderId && !linkId) {
    throw new z.errors.Error(
      'At least one of Subscription ID, Order ID, or Link ID is required.'
    );
  }

  const body = { mid };
  if (subsId) body.subsId = subsId;
  if (orderId) body.orderId = orderId;
  if (linkId) body.linkId = linkId;
  if (custId) body.custId = custId;

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/subscription/subscription/checkStatus');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  const id = subsId || orderId || linkId || 'result';
  return [{ id, ...resultBody }];
};

module.exports = {
  key: 'fetchSubscriptionStatus',
  noun: 'Subscription',
  display: {
    label: 'Fetch Subscription Status',
    description:
      'Checks the current status of a Paytm subscription by subscription ID, order ID, or link ID.',
  },
  operation: {
    inputFields: [
      {
        key: 'subsId',
        label: 'Subscription ID',
        type: 'string',
        required: false,
        helpText: 'The Paytm subscription ID. At least one identifier is required.',
      },
      {
        key: 'orderId',
        label: 'Order ID',
        type: 'string',
        required: false,
        helpText: 'The order ID linked to the subscription.',
      },
      {
        key: 'linkId',
        label: 'Link ID',
        type: 'string',
        required: false,
        helpText: 'The payment link ID linked to the subscription.',
      },
      {
        key: 'custId',
        label: 'Customer ID',
        type: 'string',
        required: false,
        helpText: 'Optional customer ID for additional filtering.',
      },
    ],
    perform,
    sample: {
      id: 'SUBS12345',
      subsId: 'SUBS12345',
      status: 'ACTIVE',
      amount: '999.00',
      frequency: 'MONTHLY',
    },
  },
};
