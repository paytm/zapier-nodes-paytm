'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToDdMmYyyy, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const body = { mid };

  const merchantRequestId = trimStr(bundle.inputData.merchantRequestId);
  if (merchantRequestId) body.merchantRequestId = merchantRequestId;

  const linkId = trimStr(bundle.inputData.linkId);
  if (linkId) body.linkId = linkId;

  const customerName = trimStr(bundle.inputData.customerName);
  if (customerName) body.customerName = customerName;

  const customerPhone = trimStr(bundle.inputData.customerPhone);
  if (customerPhone) body.customerPhone = customerPhone;

  const customerEmail = trimStr(bundle.inputData.customerEmail);
  if (customerEmail) body.customerEmail = customerEmail;

  const paymentStatus = trimStr(bundle.inputData.paymentStatus);
  if (paymentStatus) body.paymentStatus = paymentStatus;

  const resellerId = trimStr(bundle.inputData.resellerId);
  if (resellerId) body.resellerId = resellerId;

  const resellerName = trimStr(bundle.inputData.resellerName);
  if (resellerName) body.resellerName = resellerName;

  // linkTypeMultiple is a comma-separated string of FIXED and/or GENERIC
  const linkTypesRaw = trimStr(bundle.inputData.linkTypeMultiple);
  if (linkTypesRaw) {
    body.linkTypeMultiple = linkTypesRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Date range filter (DD/MM/YYYY format required by Paytm /link/fetch)
  const fromDateRaw = bundle.inputData.filterFromDate;
  const toDateRaw = bundle.inputData.filterToDate;
  const isActiveRaw = bundle.inputData.filterIsActive;
  const searchFilter = {};
  if (fromDateRaw) searchFilter.fromDate = formatDateToDdMmYyyy(fromDateRaw) || trimStr(fromDateRaw);
  if (toDateRaw) searchFilter.toDate = formatDateToDdMmYyyy(toDateRaw) || trimStr(toDateRaw);
  if (isActiveRaw !== undefined && isActiveRaw !== '') {
    searchFilter.isActive = isActiveRaw === true || isActiveRaw === 'true';
  }
  if (Object.keys(searchFilter).length > 0) body.searchFilterRequestBody = searchFilter;

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/link/fetch');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  const links = resultBody.links || resultBody.linkList || resultBody.data;

  if (Array.isArray(links)) {
    return links.map((l, i) => ({ id: l.linkId || l.merchantRequestId || i, ...l }));
  }
  return [{ id: 'result', ...resultBody }];
};

module.exports = {
  key: 'fetchPaymentLinks',
  noun: 'Payment Link',
  display: {
    label: 'Fetch Payment Links',
    description: 'Retrieves a list of payment links, optionally filtered by date, status, or customer details.',
  },
  operation: {
    inputFields: [
      {
        key: 'merchantRequestId',
        label: 'Merchant Request ID',
        type: 'string',
        required: false,
        helpText: 'Filter by a specific merchant request ID.',
      },
      {
        key: 'linkId',
        label: 'Link ID',
        type: 'string',
        required: false,
        helpText: 'Filter by a specific Paytm payment link ID.',
      },
      {
        key: 'linkTypeMultiple',
        label: 'Link Type',
        type: 'string',
        required: false,
        helpText:
          'Comma-separated link types to filter: FIXED, GENERIC, or both (e.g. "FIXED,GENERIC").',
      },
      {
        key: 'paymentStatus',
        label: 'Payment Status',
        type: 'string',
        choices: ['EXPIRED', 'INIT', 'PAID', 'PENDING'],
        required: false,
        helpText: 'Filter links by payment status.',
      },
      {
        key: 'filterFromDate',
        label: 'Filter: Start Date',
        type: 'datetime',
        required: false,
        helpText: 'Start date for the search filter (converts to DD/MM/YYYY IST).',
      },
      {
        key: 'filterToDate',
        label: 'Filter: End Date',
        type: 'datetime',
        required: false,
        helpText: 'End date for the search filter (converts to DD/MM/YYYY IST).',
      },
      {
        key: 'filterIsActive',
        label: 'Filter: Active Only',
        type: 'boolean',
        required: false,
        helpText: 'When true, returns only active links.',
      },
      {
        key: 'customerName',
        label: 'Customer Name',
        type: 'string',
        required: false,
      },
      {
        key: 'customerPhone',
        label: 'Customer Phone',
        type: 'string',
        required: false,
      },
      {
        key: 'customerEmail',
        label: 'Customer Email',
        type: 'string',
        required: false,
      },
      {
        key: 'resellerId',
        label: 'Reseller ID',
        type: 'string',
        required: false,
      },
      {
        key: 'resellerName',
        label: 'Reseller Name',
        type: 'string',
        required: false,
      },
    ],
    perform,
    sample: {
      id: 'LINK123',
      linkId: 'LINK123',
      linkName: 'Test Payment Link',
      linkType: 'FIXED',
      amount: '500.00',
      paymentStatus: 'INIT',
    },
  },
};
