#!/usr/bin/env node
'use strict';

/**
 * Verifies response date parsing: `parsePaytmDateToIso` and `deepConvertDates`
 * (same logic used in search `perform()` returns for uniform ISO output).
 *
 * Usage:
 *   node scripts/debug-response-date-iso.js
 *   node scripts/debug-response-date-iso.js --verbose
 *
 * No credentials or network required. Exits 0 if all assertions pass, 1 otherwise.
 *
 * Optional --verbose: print synthetic Paytm-like payloads before/after conversion.
 */

try {
  const fs = require('fs');
  fs.readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq < 1) return;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    });
} catch {}

const { parsePaytmDateToIso, deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');

const VERBOSE = process.argv.includes('--verbose');

let failed = 0;

function assert(eq, message) {
  if (!eq) {
    console.error('ASSERT FAIL:', message);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  const ok = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));
  assert(ok, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('── parsePaytmDateToIso (spot checks) ───────────────────');

const parseCases = [
  { label: 'DD/MM/YYYY', input: '15/01/2024', expect: '2024-01-15T12:00:00+0530' },
  { label: 'DD/MM/YYYY HH:mm:ss', input: '15/01/2024 14:30:05', expect: '2024-01-15T14:30:05+0530' },
  { label: 'DD-MM-YYYY HH:mm:ss', input: '15-01-2024 09:00:00', expect: '2024-01-15T09:00:00+0530' },
  { label: 'DD-MM-YYYY date only', input: '20-01-2024', expect: '2024-01-20T12:00:00+0530' },
  { label: 'YYYY-MM-DD', input: '2024-06-01', expect: '2024-06-01T12:00:00+0530' },
  { label: 'YYYY-MM-DD HH:mm:ss', input: '2024-06-01 13:45:00', expect: '2024-06-01T13:45:00+0530' },
  {
    label: 'ISO with offset → ±HHMM',
    input: '2024-01-15T14:30:00+05:30',
    expect: '2024-01-15T14:30:00+0530',
  },
  { label: 'ISO Z → +0000', input: '2024-01-15T09:00:00Z', expect: '2024-01-15T09:00:00+0000' },
  { label: 'ISO -0800 basic offset', input: '2023-12-01T12:32:01-0800', expect: '2023-12-01T12:32:01-0800' },
  {
    label: 'ISO space before offset',
    input: '2023-12-01T12:32:01 -0800',
    expect: '2023-12-01T12:32:01-0800',
  },
  { label: 'epoch ms number', input: 1705314600000, expect: '2024-01-15T16:00:00+0530' },
  { label: 'epoch ms string', input: '1705314600000', expect: '2024-01-15T16:00:00+0530' },
  { label: 'epoch seconds string', input: '1705314600', expect: '2024-01-15T16:00:00+0530' },
  { label: 'null', input: null, expect: null },
  { label: 'empty string', input: '', expect: '' },
  { label: 'non-date string', input: 'INIT', expect: 'INIT' },
  { label: 'small number (not epoch)', input: 42, expect: 42 },
];

for (const c of parseCases) {
  const out = parsePaytmDateToIso(c.input);
  assertEqual(out, c.expect, c.label);
}

console.log('── deepConvertDates (nested payload) ─────────────────');

const orderListSample = {
  id: 'X',
  txnDate: '15/01/2024 14:30:05',
  customerName: '15/01/2024',
  status: 'SUCCESS',
  orders: {
    orderList: [
      {
        orderId: 'O1',
        txnDate: '15-01-2024 09:00:00',
        settlementDate: '20/01/2024',
        payMode: 'UPI',
      },
      {
        orderId: 'O2',
        txnDate: '2024-01-15T14:30:00+05:30',
        paymentDate: 1705314600000,
      },
    ],
  },
  nested: { deeply: { paidDate: '20-01-2024', ref: 'INIT' } },
};

const beforeOrder = JSON.stringify(orderListSample);
const convOrder = deepConvertDates(orderListSample);
const afterOrder = JSON.stringify(orderListSample);

assert(beforeOrder === afterOrder, 'deepConvertDates must not mutate input (order list sample)');
assertEqual(
  convOrder.txnDate,
  '2024-01-15T14:30:05+0530',
  'top-level txnDate'
);
assertEqual(
  convOrder.customerName,
  '15/01/2024',
  'customerName must stay literal (not allowlisted)'
);
assertEqual(
  convOrder.orders.orderList[0].txnDate,
  '2024-01-15T09:00:00+0530',
  'nested order txnDate'
);
assertEqual(
  convOrder.orders.orderList[0].settlementDate,
  '2024-01-20T12:00:00+0530',
  'nested settlementDate'
);
assertEqual(
  convOrder.orders.orderList[1].txnDate,
  '2024-01-15T14:30:00+0530',
  'passthrough ISO txnDate'
);
assertEqual(
  convOrder.orders.orderList[1].paymentDate,
  '2024-01-15T16:00:00+0530',
  'epoch paymentDate'
);
assertEqual(
  convOrder.nested.deeply.paidDate,
  '2024-01-20T12:00:00+0530',
  'deep nested paidDate'
);

const linkSample = {
  linkId: 'L1',
  expiryDate: '31/12/2025',
  linkCreateDate: '01/06/2025 10:00:00',
  paymentStatus: 'INIT',
};

const convLink = deepConvertDates(linkSample);
assertEqual(convLink.expiryDate, '2025-12-31T12:00:00+0530', 'link expiryDate');
assertEqual(convLink.linkCreateDate, '2025-06-01T10:00:00+0530', 'link linkCreateDate');

const refundSample = [{ id: 'r1', txnDate: '10/03/2025 11:22:33', refundAmount: '99' }];
const convRefund = deepConvertDates(refundSample);
assertEqual(convRefund[0].txnDate, '2025-03-10T11:22:33+0530', 'array root refund txnDate');

const subSample = {
  subsId: 'S1',
  subscriptionStartDate: '01/01/2026',
  subscriptionExpiryDate: '01/01/2027',
  nextChargeDate: '15/01/2026 00:00:00',
  lastChargedDate: '15/12/2025',
};
const convSub = deepConvertDates(subSample);
assertEqual(convSub.subscriptionStartDate, '2026-01-01T12:00:00+0530', 'subscriptionStartDate');
assertEqual(convSub.subscriptionExpiryDate, '2027-01-01T12:00:00+0530', 'subscriptionExpiryDate');
assertEqual(convSub.nextChargeDate, '2026-01-15T00:00:00+0530', 'nextChargeDate');
assertEqual(convSub.lastChargedDate, '2025-12-15T12:00:00+0530', 'lastChargedDate');

assert(
  DATE_OUTPUT_FIELDS.has('txnDate') && DATE_OUTPUT_FIELDS.has('settlementDate'),
  'DATE_OUTPUT_FIELDS should include txnDate and settlementDate'
);

if (VERBOSE) {
  console.log('\n── VERBOSE: before / after (order list sample) ────────');
  console.log('BEFORE:', JSON.stringify(orderListSample, null, 2));
  console.log('AFTER :', JSON.stringify(convOrder, null, 2));
}

console.log();
if (failed > 0) {
  console.error(`Done: ${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log(`Done: all assertions passed (${parseCases.length} parse cases + deepConvertDates checks).`);
