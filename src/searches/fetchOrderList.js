'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, trimStr } = require('../utils');

// When the user selects ALL status, Paytm does not accept the literal string "ALL"
const ORDER_STATUS_ALL_PIPE = 'SUCCESS|FAILURE|PENDING';

const buildOrderSearchType = (selected) => {
  const s = (Array.isArray(selected) ? selected : [selected])
    .filter((x) => x != null && String(x).trim() !== '');
  if (s.length === 0 || s.includes('ALL')) return 'ALL';
  return s.join('|');
};

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const fromDate = formatDateToIst(bundle.inputData.fromDate);
  const toDate = formatDateToIst(bundle.inputData.toDate);
  if (!fromDate || !toDate) {
    throw new z.errors.Error('Start Date and End Date are required.');
  }

  const orderSearchType = buildOrderSearchType(bundle.inputData.orderSearchType);
  const statusChoice = bundle.inputData.orderSearchStatus || 'ALL';
  const orderSearchStatus = statusChoice === 'ALL' ? ORDER_STATUS_ALL_PIPE : statusChoice;

  const body = {
    mid,
    fromDate,
    toDate,
    orderSearchType,
    orderSearchStatus,
    pageNumber: Number(bundle.inputData.pageNumber) || 1,
    pageSize: Number(bundle.inputData.pageSize) || 20,
    isSort: true,
  };

  const merchantOrderId = trimStr(bundle.inputData.merchantOrderId);
  if (merchantOrderId) body.merchantOrderId = merchantOrderId;

  const payMode = trimStr(bundle.inputData.payMode);
  if (payMode) body.payMode = payMode;

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(
    bundle.authData.environment,
    '/merchant-passbook/search/list/order/v2'
  );

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  const orders = resultBody.orderList || resultBody.orders || resultBody.data;

  if (Array.isArray(orders)) {
    return orders.map((o, i) => ({ id: o.orderId || o.merchantOrderId || i, ...o }));
  }
  return [{ id: 'result', ...resultBody }];
};

module.exports = {
  key: 'fetchOrderList',
  noun: 'Order',
  display: {
    label: 'Fetch Order List',
    description:
      'Retrieves a paginated list of orders from the Paytm merchant passbook for a given date range.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'fromDate',
        label: 'Start Date',
        type: 'datetime',
        required: true,
        helpText: 'Start of the date range to fetch orders.',
      },
      {
        key: 'toDate',
        label: 'End Date',
        type: 'datetime',
        required: true,
        helpText: 'End of the date range to fetch orders.',
      },
      {
        key: 'orderSearchType',
        label: 'Transaction Type',
        type: 'string',
        choices: [
          'ALL',
          'TRANSACTION',
          'CANCEL',
          'REFUND',
          'CHARGEBACK',
          'TRANSFER_TO_BANK',
          'M2B',
          'REPAYMENT',
          'TRANSFER_FOR_SETTLEMENT',
        ],
        default: 'ALL',
        helpText: 'Type of transaction to fetch.',
      },
      {
        key: 'orderSearchStatus',
        label: 'Order Status',
        type: 'string',
        choices: ['ALL', 'SUCCESS', 'FAILURE', 'PENDING'],
        default: 'SUCCESS',
        helpText: 'Filter orders by status.',
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
        key: 'merchantOrderId',
        label: 'Merchant Order ID',
        type: 'string',
        required: false,
        helpText: 'Optional: filter by merchant-generated order ID.',
      },
      {
        key: 'payMode',
        label: 'Payment Mode',
        type: 'string',
        required: false,
        helpText: 'Optional: filter by payment mode e.g. UPI, CARD.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'merchantOrderId', label: 'Merchant Order ID' },
      { key: 'txnAmount', label: 'Transaction Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Transaction Date', type: 'datetime' },
      { key: 'payMode', label: 'Payment Mode' },
    ],
    sample: {
      id: 'ORDER12345',
      orderId: 'ORDER12345',
      merchantOrderId: 'MERCH_ORDER_001',
      txnAmount: '100.00',
      status: 'SUCCESS',
      txnDate: '2024-01-15',
    },
  },
};
