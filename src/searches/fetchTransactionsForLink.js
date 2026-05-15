'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToDdMmYyyyHhMmSs, trimStr, deepConvertDates } = require('../utils');

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
    const items = txns.map((t, i) => ({ id: t.txnId || t.orderId || i, ...t }));
    return deepConvertDates(items);
  }
  return deepConvertDates([{ id: 'result', ...resultBody }]);
};

module.exports = {
  key: 'fetch_payment_link_details',
  noun: 'Payment Link',
  display: {
    label: 'Fetch Payment Link Details',
    description: 'Fetch details for a payment link.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'linkId',
        label: 'Link ID',
        type: 'string',
        required: true,
        dynamic: 'payment_links_dropdown.linkId.linkName',
        helpText:
          'Paytm payment link ID. Open the dropdown to load links (same **POST /link/fetch** data as **Fetch All Payment Links**, ' +
          'via a hidden trigger—only `mid` applies unless you add filters elsewhere), or paste a link ID.',
      },
      {
        key: 'searchStartDate',
        label: 'Start date',
        type: 'datetime',
        required: false,
        helpText: 'Start date to fetch transactions.',
      },
      {
        key: 'searchEndDate',
        label: 'End date',
        type: 'datetime',
        required: false,
        helpText: 'End date to fetch transactions.',
      },
      {
        key: 'fetchAllTxns',
        label: 'Fetch all transactions',
        type: 'boolean',
        required: false,
        default: 'false',
        helpText: 'Fetch all transactions, including failed attempts for this payment link.',
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
