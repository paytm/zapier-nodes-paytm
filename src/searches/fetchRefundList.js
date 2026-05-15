'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, deepConvertDates } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const startDate = formatDateToIst(bundle.inputData.startDate);
  const endDate = formatDateToIst(bundle.inputData.endDate);
  if (!startDate || !endDate) {
    throw new z.errors.Error('Start Date and End Date are required.');
  }

  const body = {
    mid,
    startDate,
    endDate,
    pageNum: Number(bundle.inputData.pageNumber) || 1,
    pageSize: Number(bundle.inputData.pageSize) || 20,
    isSort: bundle.inputData.isSort !== false && bundle.inputData.isSort !== 'false',
  };

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/merchant-passbook/api/v1/refundList');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;

  // fetchRefundList returns top-level status/errorMessage (not wrapped in body)
  if (data.status && data.status !== 'SUCCESS') {
    throw new z.errors.Error(data.errorMessage || 'Failed to fetch refund list');
  }

  const refunds = data.refundList || data.data || data.refunds;
  if (Array.isArray(refunds)) {
    const items = refunds.map((r, i) => ({ id: r.refId || r.txnId || i, ...r }));
    return deepConvertDates(items);
  }
  return deepConvertDates([{ id: 'result', ...data }]);
};

module.exports = {
  key: 'fetch_all_refund',
  noun: 'Refund',
  display: {
    label: 'Fetch All Refunds',
    description:
      'Fetch all refunds within a date range.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'startDate',
        label: 'Start Date',
        type: 'datetime',
        required: true,
        helpText: 'Start of the refund search range. Sent as YYYY-MM-DDTHH:mm:ss+05:30.',
      },
      {
        key: 'endDate',
        label: 'End Date',
        type: 'datetime',
        required: true,
        helpText:
          'End of the refund search range. Maximum range is 30 days from the start date.',
      },
      {
        key: 'pageNumber',
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
        key: 'isSort',
        label: 'Sort by Date',
        type: 'boolean',
        default: 'true',
        required: false,
        helpText: 'Sort results by refund date.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'refId', label: 'Refund Reference ID' },
      { key: 'txnId', label: 'Transaction ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'refundAmount', label: 'Refund Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Refund Date', type: 'datetime' },
    ],
    sample: {
      id: 'REF12345',
      refId: 'REF12345',
      txnId: 'TXN12345',
      orderId: 'ORDER12345',
      refundAmount: '50.00',
      status: 'SUCCESS',
    },
  },
};
