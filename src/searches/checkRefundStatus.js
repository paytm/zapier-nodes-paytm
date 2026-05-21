'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr, deepConvertDates } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const orderId = trimStr(bundle.inputData.orderId);
  const refId = trimStr(bundle.inputData.refId);

  if (!orderId) throw new z.errors.Error('Order ID is required.');
  if (!refId) throw new z.errors.Error('Refund Reference ID is required.');

  const body = { mid, orderId, refId };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/v2/refund/status');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  return deepConvertDates([{ id: refId, ...resultBody }]);
};

module.exports = {
  key: 'fetch_refund_details',
  noun: 'Refund',
  display: {
    label: 'Fetch Refund Details',
    description: 'Fetch refund details for an order.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
    {
        key: 'refId',
        label: 'Refund Reference ID',
        type: 'string',
        required: true,
        dynamic: 'refunds_dropdown.refId.refIdDropdownLabel',
        helpText:
              'Refund Reference ID entered while initiating the refund.',
      },
      {
        key: 'orderId',
        label: 'Order ID',
        type: 'string',
        required: true,
        helpText:
          'Order ID against which the refund was initiated.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'refId', label: 'Refund Reference ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'refundAmount', label: 'Refund Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Refund date', type: 'datetime' },
      { key: 'refundId', label: 'Paytm Refund ID' },
      { key: 'txnTimestamp', label: 'Transaction timestamp', type: 'datetime' },
      { key: 'merchantRefundRequestTimestamp', label: 'refund request timestamp', type: 'datetime' },
      { key: 'acceptRefundTimestamp', label: 'accept refund timestamp', type: 'datetime' },
      { key: 'userCreditExpectedDate', label: 'credit accept date', type: 'datetime' },
      { key: 'userCreditInitiateTimestamp', label: 'credit initiate timestamp', type: 'datetime' },
    ],
    sample: {
      id: 'REF12345',
      refId: 'REF12345',
      orderId: 'ORDER12345',
      refundAmount: '50.00',
      status: 'SUCCESS',
      txnDate: '2024-01-15',
    },
  },
};
