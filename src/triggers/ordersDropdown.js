'use strict';

/**
 * Hidden polling trigger: delegates to search `fetch_all_orders`, then applies
 * dropdown-only row shaping (`orderId`, `txnId`, etc.).
 * Zapier row **`id`** = **`txnId`** when present (matches `txnId`-based dynamics); collisions get `__dupN`.
 *
 * Do not put that shaping in `fetchOrderList` — keeps **Fetch All Orders** output identical to the raw Passbook API.
 */

const fetchOrderList = require('../searches/fetchOrderList');
const { deepConvertDates } = require('../utils');

const MS_30_D = 30 * 24 * 60 * 60 * 1000;

const pickStr = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return '';
};

const normalizePassbookOrderRow = (o, index, txnIdOccurrences) => {
  const row = { ...o };
  const txnId = pickStr(row, ['txnId', 'TxnId', 'TXN_ID', 'txn_id', 'transactionId', 'paytmTxnId', 'gatewayTxnId']);
  const merchantOrderIdRaw = pickStr(row, ['merchantOrderId', 'MerchantOrderId', 'merchant_order_id']);
  const orderId =
    pickStr(row, ['orderId', 'orderID', 'OrderId', 'paytmOrderId', 'systemOrderId']) || txnId;

  // Zapier primary key — align with txnId-based dynamics; collisions rare but must not break invokes.
  let id;
  if (txnId) {
    const n = txnIdOccurrences.get(txnId) || 0;
    txnIdOccurrences.set(txnId, n + 1);
    id = n === 0 ? txnId : `${txnId}__dup${n}`;
  } else {
    id = `orders_dd_no_txn__idx${index}`;
  }

  const merchantOrderId =
    merchantOrderIdRaw ||
    pickStr(row, ['merchantReference', 'extOrderId', 'mercUniqueReference']) ||
    orderId ||
    txnId ||
    `Item ${index + 1}`;

  return {
    ...row,
    id,
    orderId,
    txnId: txnId || undefined,
    merchantOrderId,
  };
};

const withOrderListDefaults = (bundle) => {
  const input = { ...(bundle.inputData || {}) };
  const now = new Date();
  if (!input.fromDate || !input.toDate) {
    input.fromDate = input.fromDate || new Date(now.getTime() - MS_30_D).toISOString();
    input.toDate = input.toDate || now.toISOString();
  }
  if (input.orderSearchType == null || String(input.orderSearchType).trim() === '') {
    input.orderSearchType = 'ALL';
  }
  if (input.orderSearchStatus == null || String(input.orderSearchStatus).trim() === '') {
    input.orderSearchStatus = 'SUCCESS';
  }
  // Dynamic dropdown “Load more”: Zapier increments bundle.meta.page (0-based).
  const zapPage =
    bundle.meta && typeof bundle.meta.page === 'number' && bundle.meta.page >= 0
      ? bundle.meta.page
      : 0;
  if (input.pageNumber == null || input.pageNumber === '') {
    input.pageNumber = zapPage + 1;
  }
  if (input.pageSize == null || input.pageSize === '') {
    input.pageSize = 50;
  }
  return { ...bundle, inputData: input };
};

const perform = async (z, bundle) => {
  const rows = await fetchOrderList.operation.perform(z, withOrderListDefaults(bundle));
  if (!Array.isArray(rows)) return rows;
  const txnIdOccurrences = new Map();
  const normalized = rows.map((r, i) => normalizePassbookOrderRow(r, i, txnIdOccurrences));
  return deepConvertDates(normalized);
};

module.exports = {
  key: 'orders_dropdown',
  noun: 'Order',
  display: {
    label: 'Orders (dropdown)',
    description: 'Internal list for order / transaction ID dropdowns.',
    hidden: true,
  },
  operation: {
    type: 'polling',
    canPaginate: true,
    perform,
    sample: fetchOrderList.operation.sample,
    outputFields: fetchOrderList.operation.outputFields,
  },
};
