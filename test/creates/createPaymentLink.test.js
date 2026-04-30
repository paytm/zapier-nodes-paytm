'use strict';

const createPaymentLink = require('../../src/creates/createPaymentLink');

describe('createPaymentLink module structure', () => {
  test('has required Zapier keys', () => {
    expect(createPaymentLink.key).toBe('createPaymentLink');
    expect(createPaymentLink.noun).toBeDefined();
    expect(createPaymentLink.display.label).toBeDefined();
    expect(createPaymentLink.operation.inputFields).toBeInstanceOf(Array);
    expect(typeof createPaymentLink.operation.perform).toBe('function');
    expect(createPaymentLink.operation.sample).toBeDefined();
  });

  test('sample has an id field', () => {
    expect(createPaymentLink.operation.sample.id).toBeDefined();
  });

  test('inputFields include required fields', () => {
    const keys = createPaymentLink.operation.inputFields.map((f) => f.key);
    expect(keys).toContain('linkName');
    expect(keys).toContain('linkDescription');
    expect(keys).toContain('linkType');
    expect(keys).toContain('amount');
  });
});
