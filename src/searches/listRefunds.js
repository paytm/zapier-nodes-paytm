'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, trimStr, deepConvertDates } = require('../utils');

/**
 * Flattens Paytm Refund List API JSON into refund row objects.
 * @see https://www.paytmpayments.com/docs/api/refund-api-list-api
 */
function extractRefundListRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  if (Array.isArray(data.orders)) return data.orders;

  if (data.orders && typeof data.orders === 'object') {
    const o = data.orders;
    const arr = ['order', 'orders', 'refundList', 'refund', 'details', 'orderList'].flatMap((k) =>
      Array.isArray(o[k]) ? [o[k]] : []
    ).flat();
    if (arr.length) return arr;
    if (o.orderId || o.refId || o.refundId) return [o];
  }

  for (const k of ['refundList', 'refunds', 'refundOrders', 'data']) {
    if (Array.isArray(data[k])) return data[k];
  }

  return [];
}

const dedupeRefundRowId = (rows) => {
  const countByBase = new Map();
  return rows.map((r, i) => {
    const base =
      trimStr(r.refundId) ||
      trimStr(r.ref_id) ||
      trimStr(r.refId) ||
      trimStr(r.txnId) ||
      trimStr(r.orderId) ||
      '';
    let id = base ? base : `refund_row_${i}`;
    if (base) {
      const n = countByBase.get(base) || 0;
      countByBase.set(base, n + 1);
      if (n > 0) id = `${base}__dup${n}`;
    }
    return { id, ...r };
  });
};

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const startDate = formatDateToIst(bundle.inputData.startDate);
  const endDate = formatDateToIst(bundle.inputData.endDate);
  if (!startDate || !endDate) {
    throw new z.errors.Error(
      'startDate and endDate are required (`yyyy-MM-ddTHH:mm:ss+05:30` when sent). Max 30-day window.'
    );
  }

  let pageNum = Number(bundle.inputData.pageNum);
  if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;

  let pageSize = Number(bundle.inputData.pageSize);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 50) pageSize = 50;

  const isSortRaw = bundle.inputData.isSort;
  const isSort = isSortRaw !== false && isSortRaw !== 'false';

  const body = {
    mid,
    startDate,
    endDate,
    pageNum,
    pageSize,
    isSort,
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

  const data = response.json || {};

  if (
    data.resultCode != null &&
    String(data.resultCode).trim() !== '' &&
    String(data.resultCode).replace(/0/g, '') !== ''
  ) {
    throw new z.errors.Error(
      `${data.status || 'Request failed'} (${data.resultCode}): ${data.errorMessage || data.message || 'Refund list rejected'}`.trim()
    );
  }

  if (data.status != null && data.status !== '' && !/success/i.test(String(data.status))) {
    throw new z.errors.Error(data.errorMessage || 'Failed to list refunds.');
  }

  const refunds = extractRefundListRows(data);

  if (refunds.length === 0) {
    return deepConvertDates([{ id: 'result', count: data.count ?? 0, ...data }]);
  }

  return deepConvertDates(dedupeRefundRowId(refunds));
};

module.exports = {
  key: 'list_refunds',
  noun: 'Refund',
  display: {
    hidden: true,
    label: 'List Refunds',
    description:
      'Refund List API — refund requests between two dates (≤30-day range), pageSize up to 50.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'startDate',
        label: 'Start date',
        type: 'datetime',
        required: true,
        helpText:
          'Include refunds from this instant. Sent as `yyyy-MM-ddTHH:mm:ss+05:30` (IST). Official API: **`startDate`** body field.',
      },
      {
        key: 'endDate',
        label: 'End date',
        type: 'datetime',
        required: true,
        helpText:
          'Include refunds through this instant. **`endDate`** (must be ≤ 30 days after start).',
      },
      {
        key: 'pageNum',
        label: 'Page number',
        type: 'integer',
        default: '1',
        required: false,
        helpText: ' **`pageNum`** — first page is 1.',
      },
      {
        key: 'pageSize',
        label: 'Page size',
        type: 'integer',
        default: '20',
        required: false,
        helpText: ' **`pageSize`** — Paytm allows up to 50 per page.',
      },
      {
        key: 'isSort',
        label: 'Sort by refund date',
        type: 'boolean',
        default: 'true',
        required: false,
        helpText: ' **`isSort`** — sort refunds by refund date when supported.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'refundId', label: 'Paytm refund ID' },
      { key: 'refId', label: 'Merchant refund reference ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'txnAmount', label: 'Transaction amount', type: 'string' },
      { key: 'refundAmount', label: 'Refund amount', type: 'string' },
      { key: 'acceptRefundStatus', label: 'Accept refund status' },
      { key: 'txnTimeStamp', label: 'Txn timestamp', type: 'datetime' },
      { key: 'acceptRefundTimeStamp', label: 'Accept refund timestamp', type: 'datetime' },
      { key: 'merchantRefundRequestTimeStamp', label: 'Merchant refund request time', type: 'datetime' },
    ],
    sample: {
      id: '12345508111212868470101509706',
      refundId: '12345508111212868470101509706',
      refId: 'REFUND_MERCHANT_001',
      orderId: 'ORDER98765',
      txnAmount: '100.00',
      refundAmount: '30.00',
      acceptRefundStatus: 'SUCCESS',
    },
  },
};
