'use strict';

const { randomUUID } = require('crypto');

const BASE_URLS = {
  production: 'https://secure.paytmpayments.com',
  staging: 'https://securestage.paytmpayments.com',
};

const buildUrl = (environment, path) => {
  const base = BASE_URLS[environment] || BASE_URLS.production;
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

// Converts any ISO date string to YYYY-MM-DDTHH:mm:ss+05:30 (IST)
const formatDateToIst = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const p = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}+05:30`;
};

// Converts any ISO date string to DD/MM/YYYY
const formatDateToDdMmYyyy = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // returns DD/MM/YYYY in en-GB locale
};

// Converts any ISO date string to DD/MM/YYYY HH:MM:SS (IST)
const formatDateToDdMmYyyyHhMmSs = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const p = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.day}/${p.month}/${p.year} ${hour}:${p.minute}:${p.second}`;
};

const formatReqTimeIST = () => formatDateToIst(new Date().toISOString());

// Builds the settlement envelope (no signature — caller signs the full outerBody
// and passes it as HTTP header 'signature', confirmed against Paytm staging API).
const buildSettlementEnvelope = (merchantId, businessBody) => {
  const requestId = randomUUID();
  const innerBody = {};
  for (const [k, v] of Object.entries({ ...businessBody, merchantId })) {
    innerBody[k] = typeof v === 'string' ? v.trim() : v;
  }
  return {
    requestId,
    payload: {
      head: {
        reqTime: formatReqTimeIST(),
        reqMsgId: requestId,
      },
      body: innerBody,
    },
  };
};

const trimStr = (v) => {
  if (v === undefined || v === null) return '';
  return String(v).trim();
};

// Parses a Paytm date value (various formats) and returns ISO 8601 with IST offset.
// Returns the original value if it can't be parsed as a date (so non-date strings pass through unchanged).
// Handles: DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, DD-MM-YYYY (+ time variant),
// YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, already-ISO with offset (passthrough),
// epoch milliseconds (number or numeric string).
const parsePaytmDateToIso = (value) => {
  if (value === null || value === undefined || value === '') return value;

  // Already ISO with timezone offset (e.g. 2024-01-15T14:30:00+05:30 or ...Z) — return unchanged
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  ) {
    return value;
  }

  let date = null;

  // Numeric epoch (ms ≥ 13 digits, s ≥ 10 digits). Magnitude-gated so small
  // numbers (e.g. a count or status code that happened to land in a date field) don't get misread.
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d{10,13}$/.test(value.trim()))
  ) {
    const n = Number(value);
    if (!isNaN(n) && n >= 1e9) {
      const ms = n > 1e12 ? n : n * 1000;
      date = new Date(ms);
    }
  }

  if (!date && typeof value === 'string') {
    const s = value.trim();

    // DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss
    let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, dd, mm, yyyy, h, mi, ss] = m;
      return `${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+05:30`;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}T00:00:00+05:30`;
    }

    // YYYY-MM-DD HH:mm:ss (no offset — assume IST)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd, h, mi, ss] = m;
      return `${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+05:30`;
    }

    // YYYY-MM-DD (date only — assume IST midnight)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m;
      return `${yyyy}-${mm}-${dd}T00:00:00+05:30`;
    }

    // Fallback: native Date.parse for anything else
    const t = Date.parse(s);
    if (!isNaN(t)) date = new Date(t);
  }

  if (date && !isNaN(date.getTime())) {
    return formatDateToIst(date.toISOString());
  }

  return value; // unparseable — leave untouched
};

// Allowlist of Paytm response field names that hold dates. Used by deepConvertDates
// to avoid false-positive conversions on non-date strings that happen to look date-like.
const DATE_OUTPUT_FIELDS = new Set([
  'txnDate',
  'txnTime',
  'settlementDate',
  'settlementOrderDate',
  'paymentDate',
  'paidDate',
  'bookingDate',
  'expiryDate',
  'linkCreateDate',
  'createdDate',
  'creationDate',
  'lastUpdatedDate',
  'updatedDate',
  'modifiedDate',
  'refundDate',
  'subscriptionStartDate',
  'subscriptionExpiryDate',
  'nextChargeDate',
  'lastChargedDate',
  'startDate',
  'endDate',
  'fromDate',
  'toDate',
  'reqTime',
  'responseTime',
]);

// Recursively walks `value` and converts any field whose key is in `fieldsSet`
// from Paytm date format to ISO 8601. Returns a transformed copy; input is not mutated.
const deepConvertDates = (value, fieldsSet = DATE_OUTPUT_FIELDS) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => deepConvertDates(item, fieldsSet));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (fieldsSet.has(k) && (typeof v === 'string' || typeof v === 'number')) {
        out[k] = parsePaytmDateToIso(v);
      } else if (v && typeof v === 'object') {
        out[k] = deepConvertDates(v, fieldsSet);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
};

module.exports = {
  buildUrl,
  formatDateToIst,
  formatDateToDdMmYyyy,
  formatDateToDdMmYyyyHhMmSs,
  formatReqTimeIST,
  buildSettlementEnvelope,
  trimStr,
  parsePaytmDateToIso,
  deepConvertDates,
  DATE_OUTPUT_FIELDS,
};
