#!/usr/bin/env node
'use strict';

/**
 * Disposable debug script for the BILL_LIST settlement endpoint.
 *
 * Why this exists: helps isolate whether a "No downstream route configured for function"
 * (or similar) response is a Paytm-side staging/routing issue, a credential issue, or
 * a request-shape issue in our integration. Hits Paytm directly, no Zapier in the loop.
 *
 * Usage:
 *   1. Copy .env.example -> .env (or edit .env you already have)
 *   2. Fill PAYTM_MID and PAYTM_KEY_SECRET with STAGING credentials
 *   3. Run: node scripts/debug-bill-list.js
 *
 * Optional env overrides:
 *   PAYTM_ENV       (default: staging)         — set to production to hit prod cluster
 *   DAYS_BACK       (default: 90)              — start-date offset in days
 *   PAGE_SIZE       (default: 5)
 *
 * Output is safe to share for debugging: signature header is truncated and
 * KEY_SECRET is never printed (only its byte length, to sanity-check 16 bytes).
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

const PaytmChecksum = require('../src/checksum');
const { buildUrl, formatDateToIst, buildSettlementEnvelope } = require('../src/utils');

(async () => {
  const MID = process.env.PAYTM_MID;
  const KEY = process.env.PAYTM_KEY_SECRET;
  const ENV = process.env.PAYTM_ENV || 'staging';
  const DAYS_BACK = Number(process.env.DAYS_BACK) || 20;
  const PAGE_SIZE = Number(process.env.PAGE_SIZE) || 5;

  if (!MID || !KEY) {
    console.error('ERROR: Set PAYTM_MID and PAYTM_KEY_SECRET (in .env or as env vars).');
    process.exit(1);
  }

  const keyBytes = Buffer.byteLength(KEY, 'utf8');
  console.log('── CONFIG ──────────────────────────────────────────');
  console.log('Environment       :', ENV);
  console.log('Merchant ID       :', MID);
  console.log('Key secret bytes  :', keyBytes, keyBytes === 16 ? '(OK)' : '(WARNING: expected 16)');
  console.log('Date range        :', `last ${DAYS_BACK} days`);
  console.log('Page size         :', PAGE_SIZE);

  const businessBody = {
    ipRoleId: MID,
    settlementStartTime: formatDateToIst(new Date(Date.now() - DAYS_BACK * 86400000).toISOString()),
    settlementEndTime: formatDateToIst(new Date().toISOString()),
    pageNum: 1,
    pageSize: PAGE_SIZE,
    isSort: true,
    isFilterZeroAmount: true,
    isEventFlow: true,
  };

  const outerEnvelope = buildSettlementEnvelope(MID, businessBody);
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(outerEnvelope), KEY);
  const url = buildUrl(ENV, `/merchant-adapter/internal/settlementBillList?mid=${MID}`);

  console.log('\n── REQUEST ─────────────────────────────────────────');
  console.log('URL    :', url);
  console.log('METHOD : POST');
  console.log('HEADERS:', {
    'Content-Type': 'application/json',
    signature: signature.slice(0, 24) + '…(truncated)',
  });
  console.log('BODY   :', JSON.stringify(outerEnvelope, null, 2));

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', signature },
      body: JSON.stringify(outerEnvelope),
    });
  } catch (err) {
    console.log('\n── NETWORK ERROR ───────────────────────────────────');
    console.log(err.message);
    process.exit(1);
  }

  console.log('\n── RESPONSE ────────────────────────────────────────');
  console.log('STATUS :', res.status, res.statusText);
  const text = await res.text();
  try {
    console.log('BODY   :', JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log('BODY (raw text):', text);
  }

  // Quick diagnostic hint
  console.log('\n── DIAGNOSTIC HINT ─────────────────────────────────');
  if (res.status !== 200) {
    console.log(`Non-200 HTTP status (${res.status}) — likely transport/auth/path issue.`);
  } else {
    const lower = text.toLowerCase();
    if (lower.includes('no downstream route')) {
      console.log('Paytm responded with "no downstream route". This usually means the');
      console.log('BILL_LIST function is not provisioned for this MID/environment.');
      console.log('Most common cause: settlement endpoints are not routed in staging.');
      console.log('Try the same call with PAYTM_ENV=production (with prod credentials).');
    } else if (lower.includes('resultstatus') || lower.includes('resultinfo')) {
      console.log('Got a structured resultInfo — check resultStatus/resultCode for outcome.');
    } else {
      console.log('Response shape unfamiliar — inspect BODY above.');
    }
  }
})();
