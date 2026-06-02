'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, trimStr, deepConvertDates } = require('../utils');

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
    /** Same business id can appear more than once; Zapier requires unique `id` per row */
    const countByBase = new Map();
    const items = orders.map((o, i) => {
      const base =
        trimStr(o.orderId) ||
        trimStr(o.merchantOrderId) ||
        trimStr(o.txnId) ||
        `row_${i}`;
      const n = countByBase.get(base) || 0;
      countByBase.set(base, n + 1);
      const id = n === 0 ? base : `${base}__dup${n}`;
      return { id, ...o };
    });
    return deepConvertDates(items);
  }
  return deepConvertDates([{ id: 'result', ...resultBody }]);
};

module.exports = {
  key: 'fetch_all_orders',
  noun: 'Order',
  display: {
    label: 'Fetch All Orders',
    description: 'Fetch all orders within a date range.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'fromDate',
        label: 'Start date',
        type: 'datetime',
        required: true,
        placeholder: 'yyyy-mm-dd hh:mm:ss',
        helpText: 'Start date to fetch orders.',
      },
      {
        key: 'toDate',
        label: 'End date',
        type: 'datetime',
        required: true,
        placeholder: 'yyyy-mm-dd hh:mm:ss',
        helpText: 'End date to fetch orders.',
      },
      {
        key: 'orderSearchType',
        label: 'Transaction type',
        type: 'string',
        required: true,
        choices: {
          ALL: 'All',
          TRANSACTION: 'Transaction',
          CANCEL: 'Cancel',
          REFUND: 'Refund',
          CHARGEBACK: 'Chargeback',
          TRANSFER_TO_BANK: 'Transfer to bank',
          M2B: 'M2B',
          REPAYMENT: 'Repayment',
          TRANSFER_FOR_SETTLEMENT: 'Transfer for settlement',
        },
        default: 'ALL',
        helpText: 'Type of transaction to fetch.',
      },
      {
        key: 'orderSearchStatus',
        label: 'Order status',
        type: 'string',
        required: true,
        choices: {
          ALL: 'All',
          SUCCESS: 'Success',
          FAILURE: 'Failure',
          PENDING: 'Pending',
        },
        default: 'SUCCESS',
        helpText: 'Filter orders based on status.',
      },
      {
        key: 'pageNumber',
        label: 'Page number',
        type: 'integer',
        required: true,
        default: '1',
        helpText: 'Number of pages to fetch.',
      },
      {
        key: 'pageSize',
        label: 'Page size',
        type: 'integer',
        required: true,
        default: '20',
        helpText: 'Number of records to fetch in one iteration.',
      },
      {
        key: 'payMode',
        label: 'Payment option',
        type: 'string',
        required: false,
        helpText: 'Filter orders based on payment option used for payment.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'merchantOrderId', label: 'Merchant Order ID' },
      { key: 'txnId', label: 'Transaction ID' },
      { key: 'txnAmount', label: 'Transaction Amount' },
      { key: 'status', label: 'Status' },
      { key: 'txnDate', label: 'Transaction Date', type: 'datetime' },
      { key: 'payMode', label: 'Payment Mode' },
    ],
    sample: {
      id: 'ORDER12345',
      orderId: 'ORDER12345',
      merchantOrderId: 'MERCH_ORDER_001',
      txnId: 'TXN12345',
      txnAmount: '100.00',
      status: 'SUCCESS',
      txnDate: '2024-01-15',
    },
  },
};
