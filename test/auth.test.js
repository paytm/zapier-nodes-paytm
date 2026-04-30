'use strict';

const PaytmChecksum = require('../src/checksum');

describe('PaytmChecksum', () => {
  const key16 = 'abcdefghijklmnop'; // exactly 16 bytes

  test('generateSignature returns a non-empty string', async () => {
    const body = { mid: 'TEST_MID', fromDate: '2024-01-01', isSort: true };
    const sig = await PaytmChecksum.generateSignature(JSON.stringify(body), key16);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  test('two calls produce different signatures (random salt)', async () => {
    const body = { mid: 'TEST_MID', amount: '100' };
    const sig1 = await PaytmChecksum.generateSignature(JSON.stringify(body), key16);
    const sig2 = await PaytmChecksum.generateSignature(JSON.stringify(body), key16);
    expect(sig1).not.toBe(sig2);
  });

  test('rejects non-string/object input', async () => {
    await expect(PaytmChecksum.generateSignature(12345, key16)).rejects.toBeDefined();
  });

  test('encrypt produces base64 output', () => {
    const encrypted = PaytmChecksum.encrypt('test input string for encryption', key16);
    expect(typeof encrypted).toBe('string');
    const base64Re = /^[A-Za-z0-9+/]+=*$/;
    expect(base64Re.test(encrypted)).toBe(true);
  });

  test('calculateHash output format: 64-char hex + salt', async () => {
    const salt = await PaytmChecksum.generateRandomString(4);
    const hash = PaytmChecksum.calculateHash('test|params', salt);
    // SHA-256 hex = 64 chars, then salt appended
    expect(hash.length).toBeGreaterThan(64);
    expect(hash.slice(0, 64)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Auth: Key Secret byte length validation', () => {
  test('16-byte ASCII key is valid', () => {
    const key = 'abcdefghijklmnop';
    expect(Buffer.byteLength(key, 'utf8')).toBe(16);
  });

  test('15-byte key is invalid', () => {
    const key = 'abcdefghijklmno';
    expect(Buffer.byteLength(key, 'utf8')).not.toBe(16);
  });

  test('17-byte key is invalid', () => {
    const key = 'abcdefghijklmnopq';
    expect(Buffer.byteLength(key, 'utf8')).not.toBe(16);
  });

  test('multi-byte UTF-8 characters can exceed 16 byte length', () => {
    // "€" is 3 bytes in UTF-8
    const key = '€abcdefghijklm'; // 3 + 13 = 16 bytes, 14 chars
    expect(Buffer.byteLength(key, 'utf8')).toBe(16);
  });
});

describe('Utils: date formatters', () => {
  const { formatDateToIst, formatDateToDdMmYyyy, formatDateToDdMmYyyyHhMmSs } = require('../src/utils');

  test('formatDateToIst returns YYYY-MM-DDTHH:mm:ss+05:30', () => {
    const result = formatDateToIst('2024-06-15T10:30:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/);
  });

  test('formatDateToDdMmYyyy returns DD/MM/YYYY', () => {
    const result = formatDateToDdMmYyyy('2024-06-15T00:00:00.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  test('formatDateToDdMmYyyyHhMmSs returns DD/MM/YYYY HH:MM:SS', () => {
    const result = formatDateToDdMmYyyyHhMmSs('2024-06-15T10:30:00.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  test('returns null for invalid date', () => {
    expect(formatDateToIst('not-a-date')).toBeNull();
    expect(formatDateToDdMmYyyy('')).toBeNull();
  });
});

describe('Utils: buildUrl', () => {
  const { buildUrl } = require('../src/utils');

  test('production URL uses secure.paytmpayments.com', () => {
    const url = buildUrl('production', '/link/create');
    expect(url).toBe('https://secure.paytmpayments.com/link/create');
  });

  test('staging URL uses securestage.paytmpayments.com', () => {
    const url = buildUrl('staging', '/link/create');
    expect(url).toBe('https://securestage.paytmpayments.com/link/create');
  });

  test('unknown environment defaults to production', () => {
    const url = buildUrl('unknown', '/test');
    expect(url).toBe('https://secure.paytmpayments.com/test');
  });

  test('handles path without leading slash', () => {
    const url = buildUrl('production', 'v2/refund/status');
    expect(url).toBe('https://secure.paytmpayments.com/v2/refund/status');
  });
});
