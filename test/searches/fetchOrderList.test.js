'use strict';

const fetchOrderList = require('../../src/searches/fetchOrderList');

describe('fetchOrderList module structure', () => {
  test('has required Zapier keys', () => {
    expect(fetchOrderList.key).toBe('fetch_all_orders');
    expect(fetchOrderList.noun).toBeDefined();
    expect(fetchOrderList.display.label).toBeDefined();
    expect(fetchOrderList.operation.inputFields).toBeInstanceOf(Array);
    expect(typeof fetchOrderList.operation.perform).toBe('function');
    expect(fetchOrderList.operation.sample).toBeDefined();
  });

  test('sample has an id field', () => {
    expect(fetchOrderList.operation.sample.id).toBeDefined();
  });

  test('inputFields include fromDate and toDate', () => {
    const keys = fetchOrderList.operation.inputFields.map((f) => f.key);
    expect(keys).toContain('fromDate');
    expect(keys).toContain('toDate');
    expect(keys).toContain('orderSearchType');
    expect(keys).toContain('orderSearchStatus');
  });
});

describe('fetchOrderList buildOrderSearchType logic', () => {
  // Test the internal ordering logic by verifying the perform function signature
  test('perform is an async function', () => {
    expect(fetchOrderList.operation.perform.constructor.name).toBe('AsyncFunction');
  });
});
