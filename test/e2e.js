#!/usr/bin/env node
'use strict';

/**
 * E2E test script — validates all 13 Paytm operations against the real API.
 *
 * Usage:
 *   PAYTM_MID=xxx PAYTM_KEY_SECRET=yyy PAYTM_ENV=staging node test/e2e.js
 *
 * Or create a .env file (see .env.example) and run:
 *   node test/e2e.js
 *
 * Flags:
 *   --writes    Also run write operations (createPaymentLink, initiateRefund)
 *   --verbose   Print full response bodies
 *
 * Pass criteria:
 *   HTTP 200 = checksum accepted by Paytm, endpoint URL correct, request shape valid.
 *   A business error (e.g. "no data found") still counts as PASS — it means auth worked.
 */

// ─── Load .env ────────────────────────────────────────────────────────────────
try {
  const fs = require('fs');
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .forEach((line) => {
      const eq = line.indexOf('=');
      if (eq < 1) return;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    });
} catch {}

// Use node-fetch v2 for Node 16 compatibility; native fetch is used on Node 18+
const fetch = globalThis.fetch ?? require('node-fetch');

const PaytmChecksum = require('../src/checksum');
const {
  buildUrl,
  formatDateToIst,
  buildSettlementEnvelope,
  trimStr,
} = require('../src/utils');

// ─── Config ───────────────────────────────────────────────────────────────────
const MID = process.env.PAYTM_MID || '';
const KEY_SECRET = process.env.PAYTM_KEY_SECRET || '';
const ENV = process.env.PAYTM_ENV || 'staging';
const VERBOSE = process.argv.includes('--verbose');
const RUN_WRITES = process.argv.includes('--writes');

// Optional real IDs for deeper validation
const TEST_ORDER_ID = process.env.TEST_ORDER_ID || 'DUMMY_ORDER_001';
const TEST_TXN_ID = process.env.TEST_TXN_ID || 'DUMMY_TXN_001';
const TEST_REF_ID = process.env.TEST_REF_ID || 'DUMMY_REF_001';
const TEST_LINK_ID = process.env.TEST_LINK_ID || 'DUMMY_LINK_001';
const TEST_SUBS_ID = process.env.TEST_SUBS_ID || 'DUMMY_SUBS_001';
const TEST_BIZ_ORDER_ID = process.env.TEST_BIZ_ORDER_ID || 'DUMMY_BIZ_001';

// Date helpers
const today = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const FROM_DATE = formatDateToIst(yesterday);
const TO_DATE = formatDateToIst(today);

// ─── Colours ──────────────────────────────────────────────────────────────────
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function post(path, payload) {
  const url = buildUrl(ENV, path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { _raw: await res.text() };
  }
  return { status: res.status, data };
}

// ─── Checksum envelope builder ────────────────────────────────────────────────
async function checksumPayload(body) {
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), KEY_SECRET);
  return { body, head: { tokenType: 'AES', signature, channelId: 'WEB' } };
}

// ─── Settlement envelope builder ─────────────────────────────────────────────
async function settlementPayload(businessBody) {
  const innerBodyForSigning = { ...businessBody, merchantId: MID };
  const signature = await PaytmChecksum.generateSignature(
    JSON.stringify(innerBodyForSigning),
    KEY_SECRET
  );
  return buildSettlementEnvelope(MID, businessBody, signature);
}

// ─── Test runner ──────────────────────────────────────────────────────────────
const results = [];

async function run(name, fn) {
  process.stdout.write(`  ${c.dim('›')} ${name.padEnd(42)}`);
  try {
    const { status, data, note } = await fn();
    const pass = status === 200;
    const symbol = pass ? c.green('✓ PASS') : c.red('✗ FAIL');
    const statusStr = pass ? c.green(`HTTP ${status}`) : c.red(`HTTP ${status}`);
    console.log(`${symbol}  ${statusStr}${note ? c.dim('  ' + note) : ''}`);
    if (VERBOSE || !pass) {
      console.log(c.dim('    ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n    ')));
    } else {
      // Always print resultInfo for quick visibility
      const ri =
        data?.body?.resultInfo || data?.resultInfo || data?.payload?.body?.resultInfo;
      if (ri) {
        console.log(c.dim(`    resultInfo: ${JSON.stringify(ri)}`));
      }
    }
    results.push({ name, pass, status });
  } catch (err) {
    console.log(c.red('✗ ERROR') + c.dim(`  ${err.message}`));
    results.push({ name, pass: false, status: 'ERR' });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(c.bold('Paytm Zapier Integration — E2E Test'));
  console.log(c.dim(`  MID:  ${MID}`));
  console.log(c.dim(`  Key:  ${KEY_SECRET.slice(0, 4)}${'*'.repeat(12)}`));
  console.log(c.dim(`  Env:  ${ENV}`));
  console.log(c.dim(`  Date: ${FROM_DATE} → ${TO_DATE}`));
  console.log();

  if (!MID || !KEY_SECRET) {
    console.log(c.red('ERROR: PAYTM_MID and PAYTM_KEY_SECRET must be set.'));
    console.log('  Copy .env.example → .env and fill in your credentials.\n');
    process.exit(1);
  }

  if (Buffer.byteLength(KEY_SECRET, 'utf8') !== 16) {
    console.log(
      c.red(
        `ERROR: KEY_SECRET must be exactly 16 bytes. Found ${Buffer.byteLength(KEY_SECRET, 'utf8')} bytes.`
      )
    );
    process.exit(1);
  }

  console.log(c.bold('── ORDER ──────────────────────────────────────────'));

  await run('fetchOrderList', async () => {
    const body = {
      mid: MID,
      fromDate: FROM_DATE,
      toDate: TO_DATE,
      orderSearchType: 'ALL',
      orderSearchStatus: 'SUCCESS|FAILURE|PENDING',
      pageNumber: 1,
      pageSize: 5,
      isSort: true,
    };
    const payload = await checksumPayload(body);
    return post('/merchant-passbook/search/list/order/v2', payload);
  });

  await run('orderDetail [settlement]', async () => {
    const businessBody = { ipRoleId: MID, bizOrderId: TEST_BIZ_ORDER_ID };
    const payload = await settlementPayload(businessBody);
    const path = `/merchant-adapter/internal/ORDER_DETAIL?mid=${MID}`;
    return { ...await post(path, payload), note: `bizOrderId=${TEST_BIZ_ORDER_ID}` };
  });

  console.log();
  console.log(c.bold('── PAYMENT LINK ───────────────────────────────────'));

  await run('fetchPaymentLinks', async () => {
    const body = { mid: MID };
    const payload = await checksumPayload(body);
    return post('/link/fetch', payload);
  });

  await run('fetchTransactionsForLink', async () => {
    const body = { mid: MID, linkId: TEST_LINK_ID };
    const payload = await checksumPayload(body);
    return { ...await post('/link/fetchTransaction', payload), note: `linkId=${TEST_LINK_ID}` };
  });

  if (RUN_WRITES) {
    await run('createPaymentLink [WRITE]', async () => {
      const body = {
        mid: MID,
        linkName: 'Zapier E2E Test Link',
        linkDescription: 'E2E test',
        linkType: 'FIXED',
        amount: 1,
        maxPaymentsAllowed: 1,
        partialPayment: 'false',
        bindLinkIdMobile: false,
        sendEmail: false,
        sendSms: false,
      };
      const payload = await checksumPayload(body);
      return post('/link/create', payload);
    });
  } else {
    console.log(c.dim(`  › createPaymentLink                          ${'SKIPPED'}  (run with --writes to enable)`));
  }

  console.log();
  console.log(c.bold('── REFUND ─────────────────────────────────────────'));

  await run('fetchRefundList', async () => {
    const body = {
      mid: MID,
      startDate: FROM_DATE,
      endDate: TO_DATE,
      pageNum: 1,
      pageSize: 5,
      isSort: true,
    };
    const payload = await checksumPayload(body);
    const { status, data } = await post('/merchant-passbook/api/v1/refundList', payload);
    // fetchRefundList wraps status at top level, not in body
    const note = data.status ? `status=${data.status}` : undefined;
    return { status, data, note };
  });

  await run('checkRefundStatus', async () => {
    const body = { mid: MID, orderId: TEST_ORDER_ID, refId: TEST_REF_ID };
    const payload = await checksumPayload(body);
    return {
      ...await post('/v2/refund/status', payload),
      note: `orderId=${TEST_ORDER_ID}`,
    };
  });

  if (RUN_WRITES) {
    await run('initiateRefund [WRITE]', async () => {
      const body = {
        mid: MID,
        txnType: 'REFUND',
        orderId: TEST_ORDER_ID,
        txnId: TEST_TXN_ID,
        refId: `E2E_REF_${Date.now()}`,
        refundAmount: '1.00',
      };
      const payload = await checksumPayload(body);
      return post('/refund/apply', payload);
    });
  } else {
    console.log(c.dim(`  › initiateRefund                             ${'SKIPPED'}  (run with --writes to enable)`));
  }

  console.log();
  console.log(c.bold('── SETTLEMENT ─────────────────────────────────────'));

  await run('settlementTxnListByDate [settlement]', async () => {
    const businessBody = {
      ipRoleId: MID,
      settlementStartTime: FROM_DATE,
      settlementEndTime: TO_DATE,
      pageNum: 1,
      pageSize: 5,
    };
    const payload = await settlementPayload(businessBody);
    const path = `/merchant-adapter/internal/TxnListByDate?mid=${MID}`;
    return post(path, payload);
  });

  await run('settlementBillList [settlement]', async () => {
    const businessBody = {
      ipRoleId: MID,
      settlementStartTime: FROM_DATE,
      settlementEndTime: TO_DATE,
      pageNum: 1,
      pageSize: 5,
      isSort: true,
      isFilterZeroAmount: true,
      isEventFlow: true,
    };
    const payload = await settlementPayload(businessBody);
    const path = `/merchant-adapter/internal/BILL_LIST?mid=${MID}`;
    return post(path, payload);
  });

  console.log();
  console.log(c.bold('── SUBSCRIPTION ───────────────────────────────────'));

  await run('fetchSubscriptionStatus', async () => {
    const body = { mid: MID, subsId: TEST_SUBS_ID };
    const payload = await checksumPayload(body);
    return {
      ...await post('/subscription/subscription/checkStatus', payload),
      note: `subsId=${TEST_SUBS_ID}`,
    };
  });

  // Pause/resume and cancel are intentionally NOT run by default — they mutate live subscriptions
  console.log(c.dim(`  › pauseResumeSubscription                    SKIPPED  (mutates live data — run manually)`));
  console.log(c.dim(`  › cancelSubscription                         SKIPPED  (mutates live data — run manually)`));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log();
  console.log(c.bold('── SUMMARY ────────────────────────────────────────'));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  results.forEach((r) => {
    const icon = r.pass ? c.green('✓') : c.red('✗');
    const status = r.pass ? c.green(`HTTP ${r.status}`) : c.red(`HTTP ${r.status}`);
    console.log(`  ${icon} ${r.name.padEnd(44)} ${status}`);
  });
  console.log();
  console.log(
    `  ${c.bold('Result:')} ${c.green(`${passed} passed`)}` +
    (failed > 0 ? `, ${c.red(`${failed} failed`)}` : '') +
    `  out of ${results.length} tests run`
  );

  if (failed > 0) {
    console.log();
    console.log(c.yellow('  HTTP 4xx = bad credentials or request shape.'));
    console.log(c.yellow('  HTTP 5xx = server error (check settlement envelope structure).'));
    console.log(c.yellow('  Run with --verbose for full response bodies.'));
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red('\nUnhandled error:'), err.message);
  process.exit(1);
});
