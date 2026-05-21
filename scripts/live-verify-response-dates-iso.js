#!/usr/bin/env node
'use strict';

/**
 * Calls real Paytm APIs using each search's production `perform()` (same request
 * shaping + `deepConvertDates` as Zapier), then checks every allowlisted date field
 * in the returned payload for ISO-style **`YYYY-MM-DDTHH:mm:ss±HHMM`** (or legacy `Z`), not DD/MM.
 * DD/MM/YYYY style.
 *
 * Prerequisites:
 *   - Copy .env.example → .env with PAYTM_MID, PAYTM_KEY_SECRET (16 bytes)
 *   - PAYTM_ENV=staging or production (default: staging)
 *
 * Usage:
 *   node scripts/live-verify-response-dates-iso.js
 *   node scripts/live-verify-response-dates-iso.js --only=orders,links,refunds
 *   node scripts/live-verify-response-dates-iso.js --verbose
 *
 * Optional env (same as test/e2e.js) for ID-based operations; if missing, those
 * tests are skipped:
 *   TEST_BIZ_ORDER_ID, TEST_LINK_ID, TEST_SUBS_ID, TEST_ORDER_ID, TEST_REF_ID
 *
 * Exit 0 if every executed test finds no date-format issues; 1 if any issues
 * or unexpected errors (after at least one successful network call).
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

const { DATE_OUTPUT_FIELDS } = require('../src/utils');

const VERBOSE = process.argv.includes('--verbose');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : null;

const MID = process.env.PAYTM_MID || '';
const KEY = process.env.PAYTM_KEY_SECRET || '';
const PAYTM_ENV = process.env.PAYTM_ENV || 'staging';

const isoOk = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:\d{2}:?\d{2}|\d{4}))$/.test(s);

const looksLegacyPaytm = (s) =>
  typeof s === 'string' &&
  (/\d{2}\/\d{2}\/\d{4}/.test(s) || /^\d{2}-\d{2}-\d{4}/.test(s));

function scanDateFields(value, basePath = '', acc = []) {
  if (value == null || value === '') return acc;
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanDateFields(item, `${basePath}[${i}]`, acc));
    return acc;
  }
  if (typeof value !== 'object') return acc;
  for (const [k, v] of Object.entries(value)) {
    const p = basePath ? `${basePath}.${k}` : k;
    if (DATE_OUTPUT_FIELDS.has(k) && typeof v === 'string' && v !== '') {
      if (looksLegacyPaytm(v)) {
        acc.push({ path: p, value: v, problem: 'legacy Paytm-style date string' });
      } else if (!isoOk(v)) {
        acc.push({ path: p, value: v, problem: 'not ISO-8601 with timezone' });
      } else {
        acc.push({ path: p, value: v, problem: null });
      }
    }
    if (v != null && typeof v === 'object') scanDateFields(v, p, acc);
  }
  return acc;
}

function createZ(onResponse) {
  return {
    request: async ({ method, url, headers, body }) => {
      const res = await fetch(url, { method, headers, body });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { _parseError: true, _raw: text.slice(0, 2000) };
      }
      if (typeof onResponse === 'function') onResponse({ url, status: res.status, json });
      return { status: res.status, json };
    },
    errors: {
      Error: class extends Error {},
    },
  };
}

function authBundle(inputData = {}) {
  return {
    authData: {
      merchantId: MID,
      keySecret: KEY,
      environment: PAYTM_ENV,
    },
    inputData,
  };
}

function relIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

const yesterdayIso = relIso(1);
const todayIso = new Date().toISOString();

const TESTS = [
  {
    id: 'fetch_all_orders',
    file: '../src/searches/fetchOrderList',
    buildInput: () => ({
      fromDate: yesterdayIso,
      toDate: todayIso,
      orderSearchType: 'ALL',
      orderSearchStatus: 'SUCCESS',
      pageNumber: 1,
      pageSize: 5,
    }),
  },
  {
    id: 'fetch_all_payment_links',
    file: '../src/searches/fetchPaymentLinks',
    buildInput: () => ({}),
  },
  {
    id: 'fetch_payment_link_details',
    file: '../src/searches/fetchTransactionsForLink',
    skip: () =>
      !(process.env.TEST_LINK_ID || '').trim() ? 'set TEST_LINK_ID in .env' : null,
    buildInput: () => ({
      linkId: (process.env.TEST_LINK_ID || '').trim(),
      searchStartDate: yesterdayIso,
      searchEndDate: todayIso,
      fetchAllTxns: false,
    }),
  },
  {
    id: 'fetch_all_refund',
    file: '../src/searches/fetchRefundList',
    buildInput: () => ({
      startDate: yesterdayIso,
      endDate: todayIso,
      pageNumber: 1,
      pageSize: 5,
      isSort: true,
    }),
  },
  {
    id: 'fetch_refund_details',
    file: '../src/searches/checkRefundStatus',
    skip: () =>
      !(process.env.TEST_ORDER_ID || '').trim() || !(process.env.TEST_REF_ID || '').trim()
        ? 'set TEST_ORDER_ID and TEST_REF_ID in .env'
        : null,
    buildInput: () => ({
      orderId: (process.env.TEST_ORDER_ID || '').trim(),
      refId: (process.env.TEST_REF_ID || '').trim(),
    }),
  },
  {
    id: 'fetch_subscription_details',
    file: '../src/searches/fetchSubscriptionStatus',
    skip: () =>
      !(process.env.TEST_SUBS_ID || '').trim() && !(process.env.TEST_LINK_ID || '').trim()
        ? 'set TEST_SUBS_ID or TEST_LINK_ID in .env'
        : null,
    buildInput: () => {
      const subsId = (process.env.TEST_SUBS_ID || '').trim();
      const linkId = (process.env.TEST_LINK_ID || '').trim();
      const out = {};
      if (subsId) out.subsId = subsId;
      if (linkId) out.linkId = linkId;
      return out;
    },
  },
  {
    id: 'fetch_order_details',
    file: '../src/searches/orderDetail',
    skip: () =>
      !(process.env.TEST_BIZ_ORDER_ID || '').trim()
        ? 'set TEST_BIZ_ORDER_ID in .env'
        : null,
    buildInput: () => ({
      bizOrderId: (process.env.TEST_BIZ_ORDER_ID || '').trim(),
      isSettlementInfo: false,
      excludePaymentsData: false,
    }),
  },
  {
    id: 'fetch_all_settlements',
    file: '../src/searches/settlementTxnListByDate',
    buildInput: () => ({
      settlementStartTime: yesterdayIso,
      settlementEndTime: todayIso,
      pageNum: 1,
      pageSize: 5,
    }),
  },
  {
    id: 'fetch_settlement_details',
    file: '../src/searches/settlementBillList',
    buildInput: () => ({
      settlementStartTime: yesterdayIso,
      settlementEndTime: todayIso,
      pageNum: 1,
      pageSize: 5,
    }),
  },
];

async function main() {
  console.log('── live-verify-response-dates-iso ──────────────────────');
  console.log('Env:', PAYTM_ENV, '| MID:', MID || '(missing)');
  if (!MID || !KEY) {
    console.error('ERROR: PAYTM_MID and PAYTM_KEY_SECRET required.');
    process.exit(1);
  }
  if (Buffer.byteLength(KEY, 'utf8') !== 16) {
    console.error('ERROR: PAYTM_KEY_SECRET must be exactly 16 bytes.');
    process.exit(1);
  }

  let anyRan = false;
  let anyIssue = false;
  let anyPerformError = false;

  for (const t of TESTS) {
    if (ONLY && !ONLY.has(t.id)) continue;

    const skipReason = t.skip ? t.skip() : null;
    if (skipReason) {
      console.log(`\n○ SKIP  ${t.id}\n        ${skipReason}`);
      continue;
    }

    const mod = require(t.file);
    const inputData = t.buildInput();
    let lastHttp = null;
    const z = createZ((meta) => {
      lastHttp = meta;
    });

    process.stdout.write(`\n▶ ${t.id} `);
    try {
      const rows = await mod.operation.perform(z, authBundle(inputData));
      anyRan = true;
      if (lastHttp) {
        process.stdout.write(`HTTP ${lastHttp.status} `);
      }
      if (!Array.isArray(rows)) {
        console.log('→ unexpected return (not array), skipping scan');
        anyIssue = true;
        continue;
      }
      const hits = scanDateFields(rows);
      const bad = hits.filter((h) => h.problem);
      const good = hits.filter((h) => !h.problem);

      if (bad.length) {
        anyIssue = true;
        console.log(`→ FAIL (${bad.length} bad date field(s))`);
        for (const b of bad) {
          console.log(`   ${b.path}: ${JSON.stringify(b.value)} — ${b.problem}`);
        }
      } else if (good.length) {
        console.log(`→ OK (${good.length} date field(s) ISO-checked)`);
      } else {
        console.log('→ OK (no allowlisted date fields in response; empty or non-date payload)');
      }

      if (VERBOSE) {
        console.log('   sample row[0] keys:', rows[0] ? Object.keys(rows[0]).join(', ') : '(empty)');
        if (rows[0]) console.log('   sample:', JSON.stringify(rows[0], null, 2).slice(0, 1500));
      }
    } catch (e) {
      anyRan = true;
      anyPerformError = true;
      console.log(`→ ERROR: ${e.message}`);
      if (VERBOSE && e.stack) console.log(e.stack.split('\n').slice(0, 5).join('\n'));
    }
  }

  console.log('\n── summary ─────────────────────────────────────────────');
  if (!anyRan) {
    console.log('No tests ran (all skipped or --only filtered everything).');
    process.exit(1);
  }
  if (anyIssue) {
    console.log('Some responses still had non-ISO date strings on allowlisted fields.');
    process.exit(1);
  }
  if (anyPerformError) {
    console.log(
      'One or more perform() calls threw (API / validation). Fix credentials, IDs, or Paytm errors and re-run.'
    );
    process.exit(1);
  }
  console.log('All executed tests: no legacy / non-ISO date strings on allowlisted fields.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
