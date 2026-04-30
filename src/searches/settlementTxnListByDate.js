'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, buildSettlementEnvelope, trimStr } = require('../utils');

const SETTLEMENT_PATH = (mid) => `/merchant-adapter/internal/TxnListByDate?mid=${mid}`;

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const settlementStartTime = formatDateToIst(bundle.inputData.settlementStartTime);
  const settlementEndTime = formatDateToIst(bundle.inputData.settlementEndTime);
  if (!settlementStartTime || !settlementEndTime) {
    throw new z.errors.Error('Settlement Start Time and End Time are required.');
  }

  const businessBody = {
    ipRoleId: mid,
    settlementStartTime,
    settlementEndTime,
    pageNum: Number(bundle.inputData.pageNum) || 1,
    pageSize: Number(bundle.inputData.pageSize) || 20,
  };

  const settlementOrderId = trimStr(bundle.inputData.settlementOrderId);
  if (settlementOrderId) businessBody.settlementOrderId = settlementOrderId;

  // Build envelope first, then sign the full outerBody — signature goes in HTTP header 'signature'
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
  const txns = resultBody.txnList || resultBody.transactions || resultBody.data;

  if (Array.isArray(txns)) {
    return txns.map((t, i) => ({ id: t.txnId || t.orderId || i, ...t }));
  }
  return [{ id: 'result', ...resultBody }];
};

module.exports = {
  key: 'settlementTxnListByDate',
  noun: 'Settlement Transaction',
  display: {
    label: 'Settlement: Transaction List by Date',
    description:
      'Retrieves settlement transactions for a merchant within a specified date range.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'settlementStartTime',
        label: 'Settlement Start Time',
        type: 'datetime',
        required: true,
        helpText: 'Start of the settlement date range (converts to YYYY-MM-DDTHH:mm:ss+05:30).',
      },
      {
        key: 'settlementEndTime',
        label: 'Settlement End Time',
        type: 'datetime',
        required: true,
        helpText: 'End of the settlement date range.',
      },
      {
        key: 'pageNum',
        label: 'Page Number',
        type: 'integer',
        default: '1',
        required: false,
      },
      {
        key: 'pageSize',
        label: 'Page Size',
        type: 'integer',
        default: '20',
        required: false,
      },
      {
        key: 'settlementOrderId',
        label: 'Settlement Order ID',
        type: 'string',
        required: false,
        helpText: 'Optional: filter by a specific settlement order ID.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'txnId', label: 'Transaction ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'settlementAmount', label: 'Settlement Amount' },
      { key: 'settlementDate', label: 'Settlement Date', type: 'datetime' },
      { key: 'settleStatus', label: 'Settlement Status' },
    ],
    sample: {
      id: 'STXN12345',
      txnId: 'STXN12345',
      orderId: 'ORDER12345',
      settlementAmount: '100.00',
      settlementDate: '2024-01-15',
    },
  },
};
