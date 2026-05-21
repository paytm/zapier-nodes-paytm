'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatExpiryDateForPaytmLink, trimStr, deepConvertDates } = require('../utils');

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
  if (expiryDateRaw !== undefined && expiryDateRaw !== null && trimStr(expiryDateRaw) !== '') {
    const formatted = formatExpiryDateForPaytmLink(expiryDateRaw, bundle.meta?.timezone);
    if (!formatted) {
      throw new z.errors.Error(
        'Expiry date is invalid or unreadable. Use the date picker, YYYY-MM-DD, or an ISO datetime (time is sent as dd/mm/yyyy hh:mm:ss to Paytm).'
      );
    }
    body.expiryDate = formatted;
  }

  const linkNotes = trimStr(bundle.inputData.linkNotes);
  if (linkNotes) body.linkNotes = linkNotes;

  const customPaymentSuccessMessage = trimStr(bundle.inputData.customPaymentSuccessMessage);
  if (customPaymentSuccessMessage) body.customPaymentSuccessMessage = customPaymentSuccessMessage;

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
  return deepConvertDates({
    id: resultBody.linkId || resultBody.merchantRequestId || 'new',
    ...resultBody,
  });
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
        choices: {
          FIXED: 'Fixed (payment link with fixed amount)',
          GENERIC: 'Generic (payment link with no preset amount)',
        },
        default: 'FIXED',
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        required: false,
        placeholder: 'Txn amount in Rupees',
        helpText: 'Mandatory for FIXED payment link.',
      },
      {
        key: 'linkName',
        label: 'Link name',
        type: 'string',
        required: true,
        placeholder: 'Max 64 chars',
        helpText: 'Link label displayed to the customer.',
      },
      {
        key: 'linkDescription',
        label: 'Link description',
        type: 'string',
        required: true,
        placeholder: 'Max 30 chars',
        helpText: 'Link description displayed to the customer.',
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
        placeholder: 'customer@example.com',
        helpText: "Customer's email ID to send payment link.",
      },
      {
        key: 'customerMobile',
        label: 'Customer mobile',
        type: 'string',
        required: false,
        placeholder: '9876543210',
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
        placeholder: 'yyyy-mm-dd hh:mm:ss',
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
        key: 'customPaymentSuccessMessage',
        label: 'Payment success message',
        type: 'string',
        required: false,
        placeholder: 'Thank you for your payment',
        helpText: 'Display message after payment is successful.',
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
      { key: 'expiryDate', label: 'Expiry date', type: 'datetime' },
      { key: 'linkCreateDate', label: 'Link create date', type: 'datetime' },
      { key: 'createdDate', label: 'Created date', type: 'datetime' },
    ],
    sample: {
      id: 'LINK12345',
      linkId: 'LINK12345',
      linkUrl: 'https://paytm.com/pay/LINK12345',
      linkName: 'Product Payment',
      linkType: 'FIXED',
      amount: '500.00',
      expiryDate: '2026-12-31T18:30:00Z',
      linkCreateDate: '2026-01-15T10:00:00Z',
    },
  },
};
