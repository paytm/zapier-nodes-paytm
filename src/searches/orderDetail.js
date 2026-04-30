'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, buildSettlementEnvelope, trimStr } = require('../utils');

const SETTLEMENT_PATH = (mid) => `/merchant-adapter/internal/ORDER_DETAIL?mid=${mid}`;

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

  const innerBodyForSigning = { ...businessBody, merchantId: mid };
  const signature = await PaytmChecksum.generateSignature(
    JSON.stringify(innerBodyForSigning),
    keySecret
  );

  const outerEnvelope = buildSettlementEnvelope(mid, businessBody, signature);
  const url = buildUrl(bundle.authData.environment, SETTLEMENT_PATH(mid));

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outerEnvelope),
  });

  const data = response.json;
  const resultBody = (data.payload && data.payload.body) || data.body || data;
  return [{ id: bizOrderId, bizOrderId, ...resultBody }];
};

module.exports = {
  key: 'orderDetail',
  noun: 'Order Detail',
  display: {
    label: 'Order Detail',
    description:
      'Retrieves detailed information about a specific order including settlement data.',
  },
  operation: {
    inputFields: [
      {
        key: 'bizOrderId',
        label: 'Transaction ID',
        type: 'string',
        required: true,
        helpText: 'The Paytm transaction/order ID to look up.',
      },
      {
        key: 'isSettlementInfo',
        label: 'Include Settlement Info',
        type: 'boolean',
        required: false,
        helpText: 'When true, includes settlement details in the response.',
      },
      {
        key: 'excludePaymentsData',
        label: 'Exclude Payments Data',
        type: 'boolean',
        required: false,
        helpText: 'When true, excludes raw payment instrument data from the response.',
      },
    ],
    perform,
    sample: {
      id: 'ORDER12345',
      bizOrderId: 'ORDER12345',
      txnAmount: '500.00',
      status: 'SUCCESS',
      txnDate: '2024-01-15',
    },
  },
};
