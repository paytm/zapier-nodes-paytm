'use strict';

/**
 * Hidden polling trigger: same POST as search `fetch_all_orders`.
 * Supplies default (`fromDate`/`toDate` + paging + filters) when the editor calls `perform`
 * without the search inputs (dynamic dropdown loads only `bundle.authData`).
 */

const fetchOrderList = require('../searches/fetchOrderList');

const MS_30_D = 30 * 24 * 60 * 60 * 1000;

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
  if (input.pageNumber == null || input.pageNumber === '') {
    input.pageNumber = 1;
  }
  if (input.pageSize == null || input.pageSize === '') {
    input.pageSize = 50;
  }
  return { ...bundle, inputData: input };
};

const perform = async (z, bundle) => {
  const rows = await fetchOrderList.operation.perform(z, withOrderListDefaults(bundle));
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => ({
    ...r,
    txnId: r.txnId || r.txn_id || r.paytmTxnId || r.transactionId || r.gatewayTxnId,
  }));
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
    perform,
    sample: fetchOrderList.operation.sample,
    outputFields: fetchOrderList.operation.outputFields,
  },
};
