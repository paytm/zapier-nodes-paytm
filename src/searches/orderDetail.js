'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, buildSettlementEnvelope, trimStr, deepConvertDates } = require('../utils');

const SETTLEMENT_PATH = (mid) => `/merchant-adapter/internal/orderDetail?mid=${mid}`;

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const bizOrderId = trimStr(bundle.inputData.bizOrderId);
  if (!bizOrderId) throw new z.errors.Error('Transaction ID (bizOrderId) is required.');

  const businessBody = {
    ipRoleId: mid,
    bizOrderId,
  };

  const isSettlementInfo = bundle.inputData.isSettlementInfo;
  if (isSettlementInfo === true || isSettlementInfo === 'true') {
    businessBody.isSettlementInfo = true;
  }

  const excludePaymentsData = bundle.inputData.excludePaymentsData;
  if (excludePaymentsData === true || excludePaymentsData === 'true') {
    businessBody.excludePaymentsData = true;
  }

  const outerEnvelope = buildSettlementEnvelope(mid, businessBody);
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(outerEnvelope), keySecret);
  const url = buildUrl(bundle.authData.environment, SETTLEMENT_PATH(mid));

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json', signature },
    body: JSON.stringify(outerEnvelope),
  });

  const data = response.json;
  const resultBody = (data.payload && data.payload.body) || data.body || data;
  return deepConvertDates([{ id: bizOrderId, bizOrderId, ...resultBody }]);
};

module.exports = {
  key: 'fetch_order_details',
  noun: 'Order',
  display: {
    label: 'Fetch Order Details',
    description: 'Fetch payment and settlement details of an order.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'bizOrderId',
        label: 'Transaction ID',
        type: 'string',
        required: true,
        dynamic: 'orders_dropdown.orderId.merchantOrderId',
        helpText:
          'Order transaction ID (`bizOrderId` / Paytm **`orderId`**). Load from dropdown (recent **successful** orders, same **Fetch All Orders** Passbook list) or paste; map from a prior **Fetch All Orders** step when you need filters.',
      },
      {
        key: 'isSettlementInfo',
        label: 'Settlement details',
        type: 'boolean',
        required: false,
        default: 'false',
        helpText: 'Include settlement details in response.',
      },
      {
        key: 'excludePaymentsData',
        label: 'Exclude payments data',
        type: 'boolean',
        required: false,
        default: 'false',
        helpText: 'Exclude payment details in response.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'bizOrderId', label: 'Order ID' },
      { key: 'txnAmount', label: 'Transaction Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Transaction Date', type: 'datetime' },
      { key: 'payMode', label: 'Payment Mode' },
      { key: 'settlementAmount', label: 'Settlement Amount' },
      { key: 'settlementDate', label: 'Settlement Date', type: 'datetime' },
    ],
    sample: {
      id: 'ORDER12345',
      bizOrderId: 'ORDER12345',
      txnAmount: '500.00',
      status: 'SUCCESS',
      txnDate: '2024-01-15',
    },
  },
};
