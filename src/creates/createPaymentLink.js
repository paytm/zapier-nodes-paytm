'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToDdMmYyyy, trimStr } = require('../utils');

const LINK_NAME_MAX_LEN = 64;
const LINK_DESCRIPTION_MAX_LEN = 30;

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const linkName = trimStr(bundle.inputData.linkName);
  const linkDescription = trimStr(bundle.inputData.linkDescription);

  if (!linkName) throw new z.errors.Error('Link Name is required.');
  if (linkName.length > LINK_NAME_MAX_LEN) {
    throw new z.errors.Error(`Link Name must be at most ${LINK_NAME_MAX_LEN} characters.`);
  }
  if (!linkDescription) throw new z.errors.Error('Link Description is required.');
  if (linkDescription.length > LINK_DESCRIPTION_MAX_LEN) {
    throw new z.errors.Error(
      `Link Description must be at most ${LINK_DESCRIPTION_MAX_LEN} characters.`
    );
  }

  const linkType = bundle.inputData.linkType || 'FIXED';
  if (linkType === 'FIXED') {
    const amount = Number(bundle.inputData.amount);
    if (!amount || amount <= 0) {
      throw new z.errors.Error('Amount is required and must be greater than 0 for FIXED links.');
    }
  }

  const partialPaymentRaw = bundle.inputData.partialPayment;
  const partialPayment =
    partialPaymentRaw === true || partialPaymentRaw === 'true' ? 'true' : 'false';

  const body = {
    mid,
    linkName,
    linkDescription,
    linkType,
    maxPaymentsAllowed: Number(bundle.inputData.maxPaymentsAllowed) || 1,
    partialPayment,
    bindLinkIdMobile:
      bundle.inputData.bindLinkIdMobile === true ||
      bundle.inputData.bindLinkIdMobile === 'true',
  };

  if (linkType === 'FIXED') {
    body.amount = Number(bundle.inputData.amount);
  } else if (bundle.inputData.amount && Number(bundle.inputData.amount) > 0) {
    body.amount = Number(bundle.inputData.amount);
  }

  // Customer contact
  const customerName = trimStr(bundle.inputData.customerName);
  const customerEmail = trimStr(bundle.inputData.customerEmail);
  const customerMobile = trimStr(bundle.inputData.customerMobile);
  const customerContact = {};
  if (customerName) customerContact.customerName = customerName;
  if (customerEmail) customerContact.customerEmail = customerEmail;
  if (customerMobile) customerContact.customerMobile = customerMobile;
  if (Object.keys(customerContact).length > 0) body.customerContact = customerContact;

  body.sendEmail = Boolean(customerEmail);
  body.sendSms = Boolean(customerMobile);

  // Optional fields
  const merchantRequestId = trimStr(bundle.inputData.merchantRequestId);
  if (merchantRequestId) body.merchantRequestId = merchantRequestId;

  const customerId = trimStr(bundle.inputData.customerId);
  if (customerId) body.customerId = customerId;

  const expiryDateRaw = bundle.inputData.expiryDate;
  if (expiryDateRaw) {
    body.expiryDate = formatDateToDdMmYyyy(expiryDateRaw) || trimStr(expiryDateRaw);
  }

  const linkNotes = trimStr(bundle.inputData.linkNotes);
  if (linkNotes) body.linkNotes = linkNotes;

  const statusCallbackUrl = trimStr(bundle.inputData.statusCallbackUrl);
  if (statusCallbackUrl) body.statusCallbackUrl = statusCallbackUrl;

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/link/create');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  return { id: resultBody.linkId || resultBody.merchantRequestId || 'new', ...resultBody };
};

module.exports = {
  key: 'create_payment_link',
  noun: 'Payment Link',
  display: {
    label: 'Create Payment Link',
    description: 'Create and share payment links.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'linkType',
        label: 'Link type',
        type: 'string',
        required: true,
        choices: { FIXED: 'Amount cannot be changed', GENERIC: 'Amount can be changed' },
        default: 'FIXED',
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        required: false,
        helpText: 'Required for Fixed links. Optional preset amount for Generic links.',
      },
      {
        key: 'linkName',
        label: 'Link name',
        type: 'string',
        required: true,
        helpText: 'Link label to display to customer (max 64 chars).',
      },
      {
        key: 'linkDescription',
        label: 'Link description',
        type: 'string',
        required: true,
        helpText: 'Link description to display to customer (max 30 chars).',
      },
      {
        key: 'partialPayment',
        label: 'Partial payment',
        type: 'boolean',
        default: 'false',
        required: false,
        helpText: 'Allow customers to pay in parts.',
      },
      {
        key: 'bindLinkIdMobile',
        label: 'Bind link to mobile',
        type: 'boolean',
        default: 'false',
        required: false,
        helpText: "Bind payment link to the customer's mobile number.",
      },
      {
        key: 'maxPaymentsAllowed',
        label: 'Max payments allowed',
        type: 'integer',
        default: '1',
        required: false,
        helpText: 'Maximum number of payments allowed for this link.',
      },
      {
        key: 'customerName',
        label: 'Customer name',
        type: 'string',
        required: false,
      },
      {
        key: 'customerEmail',
        label: 'Customer email',
        type: 'string',
        required: false,
        helpText: "Customer's email ID to send payment link.",
      },
      {
        key: 'customerMobile',
        label: 'Customer mobile',
        type: 'string',
        required: false,
        helpText: "Customer's mobile number to send payment link.",
      },
      {
        key: 'customerId',
        label: 'Customer ID',
        type: 'string',
        required: false,
      },
      {
        key: 'expiryDate',
        label: 'Expiry date',
        type: 'datetime',
        required: false,
        helpText:
          'Link expiry date. Pick from the calendar or enter any date — ' +
          'it is sent to Paytm in DD/MM/YYYY format.',
      },
      {
        key: 'linkNotes',
        label: 'Link notes',
        type: 'string',
        required: false,
        helpText: 'Additional payment link notes, not shown to customer.',
      },
      {
        key: 'statusCallbackUrl',
        label: 'Status callback URL',
        type: 'string',
        required: false,
        helpText: 'Callback URL to post the transaction status.',
      },
      {
        key: 'merchantRequestId',
        label: 'Merchant request ID',
        type: 'string',
        required: false,
        helpText: 'Unique ID to be generated by merchant.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'linkId', label: 'Link ID' },
      { key: 'linkUrl', label: 'Payment URL' },
      { key: 'linkName', label: 'Link Name' },
      { key: 'linkType', label: 'Link Type' },
      { key: 'amount', label: 'Amount' },
      { key: 'merchantRequestId', label: 'Merchant Request ID' },
    ],
    sample: {
      id: 'LINK12345',
      linkId: 'LINK12345',
      linkUrl: 'https://paytm.com/pay/LINK12345',
      linkName: 'Product Payment',
      linkType: 'FIXED',
      amount: '500.00',
    },
  },
};
