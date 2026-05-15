'use strict';

const operations = [
  { mod: require('../src/searches/fetchPaymentLinks'), key: 'fetch_all_payment_links', requiredInputs: [] },
  { mod: require('../src/searches/fetchTransactionsForLink'), key: 'fetch_payment_link_details', requiredInputs: ['linkId'] },
  { mod: require('../src/searches/fetchRefundList'), key: 'fetchRefundList', requiredInputs: ['startDate', 'endDate'] },
  { mod: require('../src/searches/checkRefundStatus'), key: 'checkRefundStatus', requiredInputs: ['orderId', 'refId'] },
  { mod: require('../src/searches/fetchSubscriptionStatus'), key: 'fetch_subscription_details', requiredInputs: [] },
  { mod: require('../src/searches/settlementTxnListByDate'), key: 'settlementTxnListByDate', requiredInputs: ['settlementStartTime', 'settlementEndTime'] },
  { mod: require('../src/searches/settlementBillList'), key: 'settlementBillList', requiredInputs: ['settlementStartTime', 'settlementEndTime'] },
  { mod: require('../src/searches/orderDetail'), key: 'fetch_order_details', requiredInputs: ['bizOrderId'] },
  { mod: require('../src/searches/pauseResumeSubscription'), key: 'pause_resume_subscription', requiredInputs: ['subsId', 'status'] },
  { mod: require('../src/searches/cancelSubscription'), key: 'cancelSubscription', requiredInputs: ['subsId'] },
  { mod: require('../src/creates/initiateRefund'), key: 'create_refund', requiredInputs: ['orderId', 'txnId', 'refId', 'refundAmount'] },
  { mod: require('../src/creates/customApiCall'), key: 'customApiCall', requiredInputs: ['endpoint', 'requestBody', 'signingScheme'] },
];

describe.each(operations)('$key module structure', ({ mod, key, requiredInputs }) => {
  test('has correct Zapier key', () => {
    expect(mod.key).toBe(key);
  });

  test('has noun, display label, and description', () => {
    expect(typeof mod.noun).toBe('string');
    expect(mod.noun.length).toBeGreaterThan(0);
    expect(typeof mod.display.label).toBe('string');
    expect(typeof mod.display.description).toBe('string');
  });

  test('operation has perform function, inputFields array, sample, and outputFields', () => {
    expect(typeof mod.operation.perform).toBe('function');
    expect(mod.operation.inputFields).toBeInstanceOf(Array);
    expect(mod.operation.sample).toBeDefined();
    expect(mod.operation.outputFields).toBeInstanceOf(Array);
  });

  test('sample has an id field', () => {
    expect(mod.operation.sample.id).toBeDefined();
  });

  test('cleanInputData is false', () => {
    expect(mod.operation.cleanInputData).toBe(false);
  });

  test('outputFields all have key and label', () => {
    mod.operation.outputFields.forEach((f) => {
      expect(typeof f.key).toBe('string');
      expect(typeof f.label).toBe('string');
    });
  });

  if (requiredInputs.length > 0) {
    test('required inputFields are marked required', () => {
      const fieldMap = Object.fromEntries(mod.operation.inputFields.map((f) => [f.key, f]));
      requiredInputs.forEach((k) => {
        expect(fieldMap[k]).toBeDefined();
        expect(fieldMap[k].required).toBe(true);
      });
    });
  }
});
