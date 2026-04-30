'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToDdMmYyyyHhMmSs, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const linkId = trimStr(bundle.inputData.linkId);
  if (!linkId) {
    throw new z.errors.Error('Link ID is required.');
  }

  const body = { mid, linkId };

  const startDateRaw = bundle.inputData.searchStartDate;
  if (startDateRaw) {
    body.searchStartDate = formatDateToDdMmYyyyHhMmSs(startDateRaw) || trimStr(startDateRaw);
  }

  const endDateRaw = bundle.inputData.searchEndDate;
  if (endDateRaw) {
    body.searchEndDate = formatDateToDdMmYyyyHhMmSs(endDateRaw) || trimStr(endDateRaw);
  }

  if (bundle.inputData.fetchAllTxns === true || bundle.inputData.fetchAllTxns === 'true') {
    body.fetchAllTxns = true;
  }

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/link/fetchTransaction');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  const txns = resultBody.txnList || resultBody.transactions || resultBody.data;

  if (Array.isArray(txns)) {
    return txns.map((t, i) => ({ id: t.txnId || t.orderId || i, ...t }));
  }
  return [{ id: 'result', ...resultBody }];
};

module.exports = {
  key: 'fetchTransactionsForLink',
  noun: 'Link Transaction',
  display: {
    label: 'Fetch Transactions for Payment Link',
    description: 'Retrieves all transactions made against a specific Paytm payment link.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'linkId',
        label: 'Link ID',
        type: 'string',
        required: true,
        helpText: 'The Paytm payment link ID to fetch transactions for.',
      },
      {
        key: 'searchStartDate',
        label: 'Start Date',
        type: 'datetime',
        required: false,
        helpText: 'Optional start date filter (converts to DD/MM/YYYY HH:MM:SS IST).',
      },
      {
        key: 'searchEndDate',
        label: 'End Date',
        type: 'datetime',
        required: false,
        helpText: 'Optional end date filter (converts to DD/MM/YYYY HH:MM:SS IST).',
      },
      {
        key: 'fetchAllTxns',
        label: 'Fetch All Transactions',
        type: 'boolean',
        required: false,
        helpText: 'When true, fetches all transactions regardless of date filter.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'txnId', label: 'Transaction ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'txnAmount', label: 'Transaction Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Transaction Date', type: 'datetime' },
    ],
    sample: {
      id: 'TXN12345',
      txnId: 'TXN12345',
      orderId: 'ORDER12345',
      txnAmount: '250.00',
      status: 'SUCCESS',
    },
  },
};
