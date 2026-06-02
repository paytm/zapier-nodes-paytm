'use strict';

const PaytmChecksum = require('../src/checksum');

describe('PaytmChecksum — known vectors', () => {
  const key16 = 'abcdefghijklmnop';

  test('getStringByParams sorts keys alphabetically and joins values with pipe', () => {
    const result = PaytmChecksum.getStringByParams({ mid: 'TEST123', amount: '100.00', txnType: 'REFUND' });
    expect(result).toBe('100.00|TEST123|REFUND'); // amount < mid < txnType
  });

  test('calculateChecksum with fixed salt produces exact known output', () => {
    const params = '100.00|TEST123|REFUND';
    const result = PaytmChecksum.calculateChecksum(params, key16, 'TESTSALT');
    expect(result).toBe(
      'V8lCAlIJz0i8f5yHOUQ9FxgspMQabk9oLEmzXat1Vuh/qg6kofBE9auRnSpaZBnD0ZnnnEJKnB7Wy6jlbvGyVe4Rrew2T8f/xU0ClHavuVk='
    );
  });

  test('different keys produce different output for same params and salt', () => {
    const params = 'test|params';
    const r1 = PaytmChecksum.calculateChecksum(params, 'abcdefghijklmnop', 'SALT');
    const r2 = PaytmChecksum.calculateChecksum(params, 'ponmlkjihgfedcba', 'SALT');
    expect(r1).not.toBe(r2);
  });

  test('different params produce different output for same key and salt', () => {
    const r1 = PaytmChecksum.calculateChecksum('params_a', key16, 'SALT');
    const r2 = PaytmChecksum.calculateChecksum('params_b', key16, 'SALT');
    expect(r1).not.toBe(r2);
  });
});

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
    const key = '€abcdefghijklm';
    expect(Buffer.byteLength(key, 'utf8')).toBe(16);
  });
});

describe('Utils: date formatters', () => {
  const {
    formatDateToIst,
    formatDateToDdMmYyyy,
    formatDateToDdMmYyyyHhMmSs,
    formatExpiryDateForPaytmLink,
  } = require('../src/utils');

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

  test('formatExpiryDateForPaytmLink formats YYYY-MM-DD for Asia/Kolkata', () => {
    expect(formatExpiryDateForPaytmLink('2026-05-15', 'Asia/Kolkata')).toBe('15/05/2026');
  });

  test('formatExpiryDateForPaytmLink sends dd/mm/yyyy hh:mm:ss for ISO datetimes (n8n-style literal digits)', () => {
    expect(formatExpiryDateForPaytmLink('2026-05-19 10:00:00', 'Asia/Kolkata')).toBe('19/05/2026 10:00:00');
    expect(formatExpiryDateForPaytmLink('2026-05-19T10:00:00.000Z', null)).toBe('19/05/2026 10:00:00');
  });

  test('formatExpiryDateForPaytmLink accepts unix ms (account TZ wall clock)', () => {
    const ms = Date.UTC(2026, 4, 20, 12, 0, 0);
    expect(formatExpiryDateForPaytmLink(ms, 'UTC')).toBe('20/05/2026 12:00:00');
  });

  test('parsePaytmDateToIso emits YYYY-MM-DDTHH:mm:ss±HHMM for Zapier datetime fields', () => {
    const { parsePaytmDateToIso } = require('../src/utils');
    expect(parsePaytmDateToIso('15/01/2024 14:30:05')).toBe('2024-01-15T14:30:05+0530');
    expect(parsePaytmDateToIso('2024-01-15T14:30:00+05:30')).toBe('2024-01-15T14:30:00+0530');
    expect(parsePaytmDateToIso('2024-01-15T09:00:00Z')).toBe('2024-01-15T09:00:00+0000');
    expect(parsePaytmDateToIso('2023-12-01T12:32:01-0800')).toBe('2023-12-01T12:32:01-0800');
    expect(parsePaytmDateToIso('2023-12-01T12:32:01 -0800')).toBe('2023-12-01T12:32:01-0800');
  });

  test('parseRefundStatusCreditDateToIso: refund-status naive millis/`t` → IST civil; explicit TZ delegated', () => {
    const { parseRefundStatusCreditDateToIso, parsePaytmDateToIso } = require('../src/utils');
    expect(parseRefundStatusCreditDateToIso('2026-05-24T15:37:52.000')).toBe('2026-05-24T15:37:52+0530');
    expect(parseRefundStatusCreditDateToIso('2026-05-24t12:30:01')).toBe('2026-05-24T12:30:01+0530');
    expect(parseRefundStatusCreditDateToIso('2026-05-24T15:37:52Z')).toBe(parsePaytmDateToIso('2026-05-24T15:37:52Z'));

    const { deepConvertDates } = require('../src/utils');
    const out = deepConvertDates({
      txnTimestamp: '2026-06-02T09:09:09.042',
      merchantRefundRequestTimestamp: '2026-06-02T09:09:09.042',
      acceptRefundTimestamp: '2026-06-03t08:07:06.789',
      userCreditInitiateTimestamp: '2026-06-03T07:06:05.100',
      userCreditExpectedDate: '2026-06-03T06:05:04.045',
      refundDetailInfoList: [{ userCreditExpectedDate: '2026-06-01T09:01:02.789' }],
    });
    expect(out.txnTimestamp).toBe('2026-06-02T09:09:09+0530');
    expect(out.merchantRefundRequestTimestamp).toBe('2026-06-02T09:09:09+0530');
    expect(out.acceptRefundTimestamp).toBe('2026-06-03T08:07:06+0530');
    expect(out.userCreditInitiateTimestamp).toBe('2026-06-03T07:06:05+0530');
    expect(out.userCreditExpectedDate).toBe('2026-06-03T06:05:04+0530');
    expect(out.refundDetailInfoList[0].userCreditExpectedDate).toBe('2026-06-01T09:01:02+0530');
  });

  test('deepConvertDates converts lastOrderCreationDate (fetch subscription details) IST civil naive ISO', () => {
    const { deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');
    expect(DATE_OUTPUT_FIELDS.has('lastOrderCreationDate')).toBe(true);
    const wrapped = deepConvertDates([
      {
        id: 's1',
        lastOrderCreationDate: '2026-06-04 14:05:06.789',
      },
    ]);
    expect(wrapped[0].lastOrderCreationDate).toBe('2026-06-04T14:05:06+0530');
    const flat = deepConvertDates({ lastOrderCreationDate: '2026-05-24 15:37:52.000' });
    expect(flat.lastOrderCreationDate).toBe('2026-05-24T15:37:52+0530');
  });

  test('deepConvertDates converts orderCreatedTime and orderCompletedTime (fetch payment link details)', () => {
    const { deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');
    expect(DATE_OUTPUT_FIELDS.has('orderCreatedTime')).toBe(true);
    expect(DATE_OUTPUT_FIELDS.has('orderCompletedTime')).toBe(true);
    const out = deepConvertDates([
      {
        id: '1',
        orderCreatedTime: '01/12/2023 14:05:06',
        orderCompletedTime: '01/12/2023 14:06:00',
      },
    ]);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].orderCreatedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out[0].orderCompletedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('deepConvertDates converts updatedAt (fetch all payment links)', () => {
    const { deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');
    expect(DATE_OUTPUT_FIELDS.has('updatedAt')).toBe(true);
    const out = deepConvertDates([{ id: 'L1', updatedAt: '15/03/2024 09:30:45' }]);
    expect(out[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('deepConvertDates converts refundDetailInfoList.userCreditExpectedDate and refund status timestamps', () => {
    const { deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');
    expect(DATE_OUTPUT_FIELDS.has('txnTimestamp')).toBe(true);
    expect(DATE_OUTPUT_FIELDS.has('merchantRefundRequestTimestamp')).toBe(true);
    expect(DATE_OUTPUT_FIELDS.has('acceptRefundTimestamp')).toBe(true);
    expect(DATE_OUTPUT_FIELDS.has('refundDetailInfoList.userCreditExpectedDate')).toBe(true);
    expect(DATE_OUTPUT_FIELDS.has('userCreditInitiateTimestamp')).toBe(true);

    const payload = {
      txnTimestamp: '15/01/2024 12:00:00',
      merchantRefundRequestTimestamp: '15/01/2024 11:00:00',
      acceptRefundTimestamp: '15/01/2024 11:05:00',
      userCreditExpectedDate: '16/01/2024',
      userCreditInitiateTimestamp: '15/01/2024 11:10:00',
      refundDetailInfoList: [
        { userCreditExpectedDate: '17/01/2024' },
        { userCreditExpectedDate: '18/01/2024' },
      ],
    };
    const out = deepConvertDates(payload);
    expect(out.txnTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.refundDetailInfoList[0].userCreditExpectedDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.refundDetailInfoList[1].userCreditExpectedDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('deepConvertDates resolves notificationDetails.timestamp when qualified path is allowlisted', () => {
    const { deepConvertDates, DATE_OUTPUT_FIELDS } = require('../src/utils');
    expect(DATE_OUTPUT_FIELDS.has('notificationDetails.timestamp')).toBe(true);
    const payload = {
      txnDate: '15/01/2024',
      unrelated: {
        timestamp: '2026-06-06T06:06:06Z',
      },
      notificationDetails: {
        timestamp: '2023-12-01T12:32:01-0800',
        label: 'x',
      },
    };
    const out = deepConvertDates(payload);
    expect(out.txnDate).toBe('2024-01-15T12:00:00+0530');
    expect(out.notificationDetails.timestamp).toBe('2023-12-01T12:32:01-0800');
    expect(out.unrelated.timestamp).toBe('2026-06-06T06:06:06Z');
  });

  test('formatDateTimeForZapierOutput uses Asia/Kolkata ±HHMM (no Z)', () => {
    const { formatDateTimeForZapierOutput } = require('../src/utils');
    expect(formatDateTimeForZapierOutput(new Date('2024-06-15T12:00:00.123Z'))).toBe(
      '2024-06-15T17:30:00+0530'
    );
  });

  test('formatExpiryDateForPaytmLink returns null for junk', () => {
    expect(formatExpiryDateForPaytmLink('not-a-date', null)).toBeNull();
  });
});

describe('authentication.test (Paytm connection test)', () => {
  const authentication = require('../src/auth');

  const bundleOk = {
    authData: {
      merchantId: 'TEST_MID',
      keySecret: 'abcdefghijklmnop',
      environment: 'staging',
    },
  };

  const mockZ = (status, json, content) => ({
    request: jest.fn().mockResolvedValue({
      status,
      json,
      ...(content !== undefined ? { content } : {}),
    }),
    errors: { Error: class AuthErr extends Error {} },
  });

  test('passes when HTTP 200 and link/fetch resultStatus S with empty links', async () => {
    const z = mockZ(200, {
      body: {
        resultInfo: { resultStatus: 'S', resultCode: '0000', resultMsg: 'Success' },
        links: [],
      },
    });
    await expect(authentication.test(z, bundleOk)).resolves.toEqual({
      merchantId: 'TEST_MID',
      environment: 'staging',
    });
  });

  test('throws when Paytm returns checksum invalid (wrong key vs MID)', async () => {
    const z = mockZ(200, {
      body: {
        resultInfo: {
          resultStatus: 'F',
          resultMsg: 'Checksum provided is invalid.',
        },
      },
    });
    await expect(authentication.test(z, bundleOk)).rejects.toThrow(/Paytm rejected these credentials/i);
  });

  test('throws when Paytm returns merchant preference error (wrong MID vs env)', async () => {
    const z = mockZ(200, {
      body: {
        resultInfo: {
          resultMsg: 'Error while fetching merchant preference Detail',
        },
      },
    });
    await expect(authentication.test(z, bundleOk)).rejects.toThrow(/Paytm rejected these credentials/i);
  });

  test('throws when Paytm returns application-level failure on HTTP 200', async () => {
    const z = mockZ(200, {
      body: {
        resultInfo: {
          resultStatus: 'F',
          resultCode: 'BAD_SIGNATURE',
          resultMsg: 'Checksum mismatch',
        },
      },
    });
    await expect(authentication.test(z, bundleOk)).rejects.toThrow(/Paytm rejected the credentials/i);
  });

  test('throws on non-2xx HTTP', async () => {
    const z = mockZ(401, {});
    await expect(authentication.test(z, bundleOk)).rejects.toThrow(/HTTP 401/);
  });

  test('throws when response has no resultInfo', async () => {
    const z = mockZ(200, {});
    await expect(authentication.test(z, bundleOk)).rejects.toThrow(/Unexpected Paytm response shape/);
  });

  test('throws when MID or Key Secret missing', async () => {
    const z = mockZ(200, {
      body: { resultInfo: { resultStatus: 'S', resultCode: '0000', resultMsg: 'Success' } },
    });
    await expect(
      authentication.test(z, {
        authData: { merchantId: '', keySecret: 'abcdefghijklmnop', environment: 'staging' },
      }),
    ).rejects.toThrow(/Merchant ID and Key Secret are required/);
  });

  test('SUCCESS alias passes', async () => {
    const z = mockZ(200, {
      body: {
        resultInfo: { resultStatus: 'SUCCESS', resultMsg: 'OK' },
        links: [],
      },
    });
    await expect(authentication.test(z, bundleOk)).resolves.toBeDefined();
  });

  test('parses JSON from response.content when json is missing', async () => {
    const payload = {
      body: {
        resultInfo: { resultStatus: 'S', resultCode: '0000', resultMsg: 'Success' },
        links: [],
      },
    };
    const z = mockZ(200, undefined, JSON.stringify(payload));
    await expect(authentication.test(z, bundleOk)).resolves.toEqual({
      merchantId: 'TEST_MID',
      environment: 'staging',
    });
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
