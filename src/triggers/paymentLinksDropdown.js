'use strict';

/**
 * Hidden polling trigger: same `perform` as search `fetch_all_payment_links` (`POST /link/fetch`).
 * Powers `dynamic` on **Fetch Payment Link Details** → Link ID (no user-facing trigger card).
 */

const fetchPaymentLinksSearch = require('../searches/fetchPaymentLinks');

module.exports = {
  key: 'payment_links_dropdown',
  noun: 'Payment Link',
  display: {
    label: 'Payment links (dropdown)',
    description: 'Internal list for Link ID dropdowns.',
    hidden: true,
  },
  operation: {
    perform: fetchPaymentLinksSearch.operation.perform,
    sample: fetchPaymentLinksSearch.operation.sample,
    outputFields: fetchPaymentLinksSearch.operation.outputFields,
  },
};
