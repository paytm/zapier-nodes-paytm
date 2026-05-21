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

/** DD/MM/YYYY HH:mm:ss (24h) in the Zap account timezone (falls back to Asia/Kolkata). */
const formatDdMmYyyyHhMmSsInTimeZone = (date, accountTimeZone) => {
  const tz =
    accountTimeZone && typeof accountTimeZone === 'string' && accountTimeZone.trim()
      ? accountTimeZone.trim()
      : 'Asia/Kolkata';
  const partsForTz = (timeZone) => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const p = {};
    for (const part of fmt.formatToParts(date)) {
      if (part.type !== 'literal') p[part.type] = part.value;
    }
    const hour = p.hour === '24' ? '00' : p.hour;
    return `${p.day}/${p.month}/${p.year} ${hour}:${p.minute}:${p.second}`;
  };
  try {
    return partsForTz(tz);
  } catch (_) {
    return partsForTz('Asia/Kolkata');
  }
};

/**
 * `dd/mm/yyyy hh:mm:ss` from ISO **calendar digits** (no instant→TZ shift), matching n8n
 * `toDdMmYyyySpaceHhMmSsFromIsoDigits`.
 */
const toDdMmYyyySpaceHhMmSsFromIsoDigits = (iso) => {
  const t = String(iso).trim();
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i
  );
  if (!m) return null;
  const [, y, mo, day, h, mi, sec] = m;
  const seconds = sec ?? '00';
  return `${day}/${mo}/${y} ${h}:${mi}:${seconds}`;
};

/** `dd/mm/yyyy` ← `YYYY-MM-DD` (digit reorder only). */
const yyyyMmDdToDdMmYyyySlash = (ymd) => {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
};

/**
 * `/link/create` **expiryDate**: **`dd/mm/yyyy`** or **`dd/mm/yyyy hh:mm:ss`** (n8n parity).
 * - ISO / `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss` strings: **literal** date (and time if present) → no day shift.
 * - `Date` / unix ms: wall clock in **Zap `bundle.meta.timezone`** (default **Asia/Kolkata**).
 */
const formatExpiryDateForPaytmLink = (raw, accountTimeZone) => {
  if (raw === undefined || raw === null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? null : formatDdMmYyyyHhMmSsInTimeZone(date, accountTimeZone);
  }

  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : formatDdMmYyyyHhMmSsInTimeZone(raw, accountTimeZone);
  }

  const s = String(raw).trim();
  if (!s) return null;

  if (/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.test(s)) {
    return s;
  }

  if (/^(\d{2})\/(\d{2})\/(\d{4})$/.test(s)) {
    return s;
  }

  const withTimeFromDigits = toDdMmYyyySpaceHhMmSsFromIsoDigits(s);
  if (withTimeFromDigits) {
    return withTimeFromDigits;
  }

  const dateOnly = yyyyMmDdToDdMmYyyySlash(s);
  if (dateOnly) {
    return dateOnly;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return formatDdMmYyyyHhMmSsInTimeZone(parsed, accountTimeZone);
  }

  return null;
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

/**
 * Normalizes trailing zone to **±HHMM** (ISO 8601 basic). `Z` → `+0000`.
 */
const normalizeZoneSuffixToHHMM = (zoneRaw) => {
  const z = String(zoneRaw).trim();
  if (/^z$/i.test(z)) return '+0000';
  const m = z.match(/^([+-])(.+)$/);
  if (!m) return '+0000';
  const digits = m[2].replace(/:/g, '');
  if (digits.length >= 4) return `${m[1]}${digits.slice(0, 4)}`;
  if (digits.length === 2) return `${m[1]}${digits}00`;
  return '+0000';
};

/**
 * `GMT+05:30` / `GMT-08:00` / `GMT-8` (from Intl `timeZoneName: 'longOffset'`) → **`+0530`**, **`-0800`**.
 */
const parseGmtLongOffsetToNumeric = (gmtStr) => {
  const m = String(gmtStr).match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return '+0000';
  const hh = m[2].padStart(2, '0');
  const mm = (m[3] ?? '00').padStart(2, '0');
  return `${m[1]}${hh}${mm}`;
};

/**
 * Instant → `YYYY-MM-DDTHH:mm:ss±HHMM` in **IANA** `timeZone` (default Paytm merchant wall: Asia/Kolkata).
 */
const formatInstantAsIsoNumericOffset = (date, timeZone = 'Asia/Kolkata') => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hh = get('hour');
  if (hh === '24') hh = '00';
  const y = get('year');
  const mo = get('month');
  const day = get('day');
  const tzName = get('timeZoneName') || '';
  const off = parseGmtLongOffsetToNumeric(tzName);
  return `${y}-${mo}-${day}T${hh}:${get('minute')}:${get('second')}${off}`;
};

/** Paytm IST-walled ambiguous fields: keep civil clock with **+0530**. */
const formatIstCivilIsoNumericOffset = (yyyy, mm, dd, h, mi, ss) =>
  `${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+0530`;

/**
 * ISO string that already carries `Z` or `±…` → canonical **`…T…±HHMM`** (no `Z`, no millis).
 */
const canonicalizeExplicitOffsetIsoString = (trimmed) => {
  const m = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-](?:\d{2}:?\d{2}|\d{4}))$/i
  );
  if (!m) return null;
  const [, y, mo, day, h, mi, ss, z] = m;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return `${y}-${mo}-${day}T${h}:${mi}:${ss}${normalizeZoneSuffixToHHMM(z)}`;
};

/**
 * Zapier `datetime` output: **`YYYY-MM-DDTHH:mm:ss±HHMM`** (no `Z`, no millis).
 * For bare `Date` / instants without a Paytm source string, uses **Asia/Kolkata** wall + offset.
 */
const formatDateTimeForZapierOutput = (date) => formatInstantAsIsoNumericOffset(date, 'Asia/Kolkata');

/** Collapses stray whitespace before `Z` or a numeric timezone so `Date` parses reliably. */
const normalizeIsoTimezoneSpacing = (s) =>
  String(s)
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(?=[Z+-])/i, '$1');

/** ISO-ish datetime + offset (`Z`, `±HH:MM`, `±HHMM`, `±HH`). */
const ISO_DATETIME_WITH_TZ_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*(?:Z|[+-](?:\d{2}:?\d{2}|\d{4}))$/i;

// Parses Paytm date strings → Zapier **`YYYY-MM-DDTHH:mm:ss±HHMM`** (no `Z`). Explicit offsets are
// preserved; ambiguous India-wall inputs use **`+0530`**; epoch / Date.parse fallback uses Asia/Kolkata.
const parsePaytmDateToIso = (value) => {
  if (value === null || value === undefined || value === '') return value;

  if (typeof value === 'string') {
    const trimmed = normalizeIsoTimezoneSpacing(value);
    if (ISO_DATETIME_WITH_TZ_REGEX.test(trimmed)) {
      const canonical = canonicalizeExplicitOffsetIsoString(trimmed);
      if (canonical != null) return canonical;
    }
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
    const s = normalizeIsoTimezoneSpacing(value).trim();

    // DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss (wall time in IST)
    let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, dd, mm, yyyy, h, mi, ss] = m;
      const inst = new Date(`${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+05:30`);
      if (!isNaN(inst.getTime())) return formatIstCivilIsoNumericOffset(yyyy, mm, dd, h, mi, ss);
    }

    // DD/MM/YYYY or DD-MM-YYYY (date only — use **noon IST** so Zapier UTC view stays on same calendar day)
    m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const inst = new Date(`${yyyy}-${mm}-${dd}T12:00:00+05:30`);
      if (!isNaN(inst.getTime())) return formatIstCivilIsoNumericOffset(yyyy, mm, dd, '12', '00', '00');
    }

    // YYYY-MM-DD HH:mm:ss (no offset — assume IST)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd, h, mi, ss] = m;
      const inst = new Date(`${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+05:30`);
      if (!isNaN(inst.getTime())) return formatIstCivilIsoNumericOffset(yyyy, mm, dd, h, mi, ss);
    }

    // YYYY-MM-DD (date only — assume IST **noon** for all-day stamps; avoids UTC calendar appearing as previous day)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m;
      const inst = new Date(`${yyyy}-${mm}-${dd}T12:00:00+05:30`);
      if (!isNaN(inst.getTime())) return formatIstCivilIsoNumericOffset(yyyy, mm, dd, '12', '00', '00');
    }

    // Fallback: native Date.parse for anything else
    const t = Date.parse(s);
    if (!isNaN(t)) date = new Date(t);
  }

  if (date && !isNaN(date.getTime())) {
    return formatInstantAsIsoNumericOffset(date, 'Asia/Kolkata');
  }

  return value; // unparseable — leave untouched
};

/**
 * Paytm sends **naive** ISO-ish datetimes (**`YYYY-MM-DD[ Tt]HH:mm:ss(.fff)`** without zone) for several APIs.
 * **`Date.parse`** as UTC plus **Asia/Kolkata** display adds **+05:30** again (**+5½h** wrong wall vs IST intent).
 *
 * Used in {@link deepConvertDates} for keys in **`REFUND_CHECK_IST_NAIVE_ISO_KEYS`** and **`SUBSCRIPTION_IST_NAIVE_ISO_KEYS`**.
 *
 * **No TZ** → **IST civil** **`+0530`**; explicit `Z`/`±offset` delegates to {@link parsePaytmDateToIso}.
 */
const parseRefundStatusCreditDateToIso = (value) => {
  if (typeof value !== 'string') return parsePaytmDateToIso(value);
  const trimmed = normalizeIsoTimezoneSpacing(value).trim();
  if (ISO_DATETIME_WITH_TZ_REGEX.test(trimmed)) {
    return parsePaytmDateToIso(value);
  }
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m) {
    const [, yyyy, mm, dd, h, mi, ss] = m;
    const inst = new Date(`${yyyy}-${mm}-${dd}T${h}:${mi}:${ss}+05:30`);
    if (!isNaN(inst.getTime())) return formatIstCivilIsoNumericOffset(yyyy, mm, dd, h, mi, ss);
  }
  return parsePaytmDateToIso(value);
};

const REFUND_CHECK_IST_NAIVE_ISO_KEYS = new Set([
  /** Refund-status primary timestamps — naive millis / lowercase `t` must stay IST civil. */
  'txnTimestamp',
  'merchantRefundRequestTimestamp',
  'acceptRefundTimestamp',
  'userCreditInitiateTimestamp',
  'userCreditExpectedDate',
]);

const SUBSCRIPTION_IST_NAIVE_ISO_KEYS = new Set([
  /** `POST /subscription/subscription/checkStatus` — same naive wall-time semantics as refunds */
  'lastOrderCreationDate',
]);

// Allowlist used by {@link deepConvertDates}: bare keys convert at **any** depth; dotted keys match
// only as **`qualifiedPath`** (`parent.child`) so unrelated `timestamp` fields stay literal.
const DATE_OUTPUT_FIELDS = new Set([
  'txnDate',
  'txnTime',
  /** `/link/fetchTransaction` txn row timestamps (same endpoint as Fetch Payment Link Details). */
  'orderCompletedTime',
  'orderCreatedTime',
  'settlementDate',
  'settlementTime',
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
  /** Payment link rows from **`/link/fetch`** (Fetch All Payment Links). */
  'updatedAt',
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
  /** Prefer qualified key so generic `timestamp` keys elsewhere are untouched. */
  'notificationDetails.timestamp',
  /** Refund status `POST /v2/refund/status` — Paytm has used both **`TimeStamp`** and **`Timestamp`** casing. */
  'txnTimestamp',
  'txnTimeStamp',
  'merchantRefundRequestTimestamp',
  'acceptRefundTimestamp',
  'merchantRefundRequestTimeStamp',
  'acceptRefundTimeStamp',
  'acceptRefundTimeStamp',
  /** Top-level or nested under `refundDetailInfoList[]` (qualified path for list items). */
  'userCreditExpectedDate',
  'refundDetailInfoList.userCreditExpectedDate',
  'userCreditInitiateTimestamp',
  'lastOrderCreationDate',
]);

// Recursively walks `value` and converts any field whose **key** or **`parentPath.key`**
// is in `fieldsSet` from Paytm date strings to Zapier-friendly **`YYYY-MM-DDTHH:mm:ss±HHMM`**.
// Returns a transformed copy; input is not mutated.
const deepConvertDates = (value, fieldsSet = DATE_OUTPUT_FIELDS, parentPath = '') => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => deepConvertDates(item, fieldsSet, parentPath));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const qualifiedKey = parentPath ? `${parentPath}.${k}` : k;
      const matchesDateField =
        (typeof v === 'string' || typeof v === 'number') &&
        (fieldsSet.has(k) || fieldsSet.has(qualifiedKey));
      if (matchesDateField) {
        out[k] =
          REFUND_CHECK_IST_NAIVE_ISO_KEYS.has(k) || SUBSCRIPTION_IST_NAIVE_ISO_KEYS.has(k)
            ? parseRefundStatusCreditDateToIso(v)
            : parsePaytmDateToIso(v);
      } else if (v && typeof v === 'object') {
        out[k] = deepConvertDates(v, fieldsSet, qualifiedKey);
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
  formatExpiryDateForPaytmLink,
  formatDateToDdMmYyyyHhMmSs,
  formatDateTimeForZapierOutput,
  formatReqTimeIST,
  buildSettlementEnvelope,
  trimStr,
  parsePaytmDateToIso,
  parseRefundStatusCreditDateToIso,
  deepConvertDates,
  DATE_OUTPUT_FIELDS,
};
