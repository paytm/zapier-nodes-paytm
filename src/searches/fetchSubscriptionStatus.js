'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr, deepConvertDates } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const subsId = trimStr(bundle.inputData.subsId);
  const orderId = trimStr(bundle.inputData.orderId);
  const linkId = trimStr(bundle.inputData.linkId);
  const custId = trimStr(bundle.inputData.custId);

  // Sheet rule: provide Subscription ID, OR Link ID, OR (Order ID + Customer ID).
  if (!subsId && !linkId && !(orderId && custId)) {
    throw new z.errors.Error(
      'Provide Subscription ID, Link ID, or both Order ID and Customer ID.'
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
  return deepConvertDates([{ id, ...resultBody }]);
};

module.exports = {
  key: 'fetch_subscription_details',
  noun: 'Subscription',
  display: {
    label: 'Fetch Subscription Details',
    description: 'Fetch subscription status and payment details for your account.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'subsId',
        label: 'Subscription ID',
        type: 'string',
        required: false,
      },
      {
        key: 'orderId',
        label: 'Order ID',
        type: 'string',
        required: false,
        helpText: 'Order ID to fetch subscription details.',
      },
      {
        key: 'linkId',
        label: 'Link ID',
        type: 'string',
        required: false,
        helpText: 'Link ID in case of link based subscriptions.',
      },
      {
        key: 'custId',
        label: 'Customer ID',
        type: 'string',
        required: false,
        helpText: 'Either use subscription ID or (order ID + customer ID) to fetch subscription details.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'subsId', label: 'Subscription ID' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'linkId', label: 'Link ID' },
    ],
    sample: {
      id: 'SUBS12345',
      subsId: 'SUBS12345',
      status: 'ACTIVE',
      amount: '999.00',
      frequency: 'MONTHLY',
    },
  },
};
