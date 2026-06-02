'use strict';

/**
 * Hidden polling trigger: delegates to **`list_refunds`** (`POST …/merchant-passbook/api/v1/refundList`).
 * Powers **`dynamic`** on **Fetch Refund Details** → **Refund Reference ID** (`refunds_dropdown.refId.refIdDropdownLabel`; value is merchant **`refId`** from Refund List / **`orders[].refId`**).
 * Dropdown row **`id`** remains **`refundId`** (Paytm id); **`refId`** is the selectable merchant reference for status checks.
 *
 * Request envelope (`tokenType: AES`, `JSON.stringify(body)` signature) matches other passbook checksum APIs — see Paytm docs for field names (**`startDate`**, **`endDate`**, **`pageNum`**, **`pageSize`**).
 *
 * Public doc alternate head (**`CHECKSUM`**, **`clientId`**) applies to other integrations; Zapier integration uses **`AES`** + **`WEB`** consistently with `fetch_all_refund`.
 */

const listRefunds = require('../searches/listRefunds');

const MS_30_D = 30 * 24 * 60 * 60 * 1000;

const pickStr = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return '';
};

const normalizeRefundRow = (o, index, refundIdCounts) => {
  const row = { ...o };
  const refundId = pickStr(row, ['refundId', 'refund_id', 'RefundId']);
  let id;
  if (refundId) {
    const n = refundIdCounts.get(refundId) || 0;
    refundIdCounts.set(refundId, n + 1);
    id = n === 0 ? refundId : `${refundId}__dup${n}`;
  } else {
    id = `refunds_dd_no_id__idx${index}`;
  }
  /** Merchant refund reference (`orders[].refId` shape from Refund List API). */
  const refId =
    pickStr(row, ['refId', 'ref_id', 'RefId']) || pickStr(row, ['merchantRefundId']);
  const orderId = pickStr(row, ['orderId', 'OrderId', 'order_id']);

  let refIdDropdownLabel = '';
  if (orderId && refId) refIdDropdownLabel = `${orderId} — ${refId}`;
  else refIdDropdownLabel = refId || orderId || refundId || id;

  return {
    ...row,
    id,
    refundId: refundId || undefined,
    refId: refId || undefined,
    orderId: orderId || undefined,
    refIdDropdownLabel,
  };
};

const withRefundListDefaults = (bundle) => {
  const input = { ...(bundle.inputData || {}) };
  const now = new Date();
  if (!input.startDate || !input.endDate) {
    input.startDate = input.startDate || new Date(now.getTime() - MS_30_D).toISOString();
    input.endDate = input.endDate || now.toISOString();
  }
  const zapPage =
    bundle.meta && typeof bundle.meta.page === 'number' && bundle.meta.page >= 0
      ? bundle.meta.page
      : 0;
  if (input.pageNum == null || input.pageNum === '') {
    input.pageNum = zapPage + 1;
  }
  if (input.pageSize == null || input.pageSize === '') {
    input.pageSize = 50;
  }
  if (input.isSort == null || input.isSort === '') {
    input.isSort = true;
  }
  return { ...bundle, inputData: input };
};

const perform = async (z, bundle) => {
  const rows = await listRefunds.operation.perform(z, withRefundListDefaults(bundle));
  if (!Array.isArray(rows)) return rows;

  const emptySummary = rows.length === 1 && rows[0] && rows[0].id === 'result';
  if (emptySummary) return rows;

  const refundIdCounts = new Map();
  return rows
    .map((r, i) => normalizeRefundRow(r, i, refundIdCounts))
    .filter((r) => Boolean(r.refId && String(r.refId).trim() !== ''));
};

module.exports = {
  key: 'refunds_dropdown',
  noun: 'Refund',
  display: {
    label: 'Refunds (dropdown)',
    description: 'Internal list for refund / ref id dropdowns (Refund List API).',
    hidden: true,
  },
  operation: {
    type: 'polling',
    canPaginate: true,
    perform,
    sample: {
      ...listRefunds.operation.sample,
      refIdDropdownLabel: 'ORDER98765 — REFUND_MERCHANT_001',
    },
    outputFields: [
      ...listRefunds.operation.outputFields,
      {
        key: 'refIdDropdownLabel',
        label: 'Merchant refund ref (dropdown label)',
      },
    ],
  },
};
