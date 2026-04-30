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

// Builds the settlement envelope. The signature is embedded in payload.head
// to match the AES tokenisation pattern used by all other Paytm checksum APIs.
const buildSettlementEnvelope = (merchantId, businessBody, signature) => {
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
        tokenType: 'AES',
        signature,
        channelId: 'WEB',
      },
      body: innerBody,
    },
  };
};

const trimStr = (v) => {
  if (v === undefined || v === null) return '';
  return String(v).trim();
};

module.exports = {
  buildUrl,
  formatDateToIst,
  formatDateToDdMmYyyy,
  formatDateToDdMmYyyyHhMmSs,
  formatReqTimeIST,
  buildSettlementEnvelope,
  trimStr,
};
