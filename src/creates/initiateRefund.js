'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, trimStr } = require('../utils');

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const orderId = trimStr(bundle.inputData.orderId);
  const txnId = trimStr(bundle.inputData.txnId);
  const refId = trimStr(bundle.inputData.refId);
  const refundAmountRaw = bundle.inputData.refundAmount;

  if (!orderId) throw new z.errors.Error('Order ID is required.');
  if (!txnId) throw new z.errors.Error('Transaction ID is required.');
  if (!refId) throw new z.errors.Error('Refund Reference ID is required.');
  if (!refundAmountRaw) throw new z.errors.Error('Refund Amount is required.');

  // Format to two decimal places as required by Paytm
  const refundAmount = Number(refundAmountRaw).toFixed(2);
  if (isNaN(Number(refundAmount)) || Number(refundAmount) <= 0) {
    throw new z.errors.Error('Refund Amount must be a positive number.');
  }

  const txnType = trimStr(bundle.inputData.txnType) || 'REFUND';

  const body = {
    mid,
    txnType,
    orderId,
    txnId,
    refId,
    refundAmount,
  };

  const comments = trimStr(bundle.inputData.comments);
  if (comments) body.comments = comments;

  const disableRetry = bundle.inputData.disableMerchantDebitRetry;
  if (disableRetry === true || disableRetry === 'true') {
    body.disableMerchantDebitRetry = true;
  }

  // Optional agent info — exposed as flat fields and assembled into agentInfo object
  const agentEmployeeId = trimStr(bundle.inputData.agentEmployeeId);
  const agentName = trimStr(bundle.inputData.agentName);
  const agentPhoneNo = trimStr(bundle.inputData.agentPhoneNo);
  const agentEmail = trimStr(bundle.inputData.agentEmail);
  const agentInfo = {};
  if (agentEmployeeId) agentInfo.employeeId = agentEmployeeId;
  if (agentName) agentInfo.name = agentName;
  if (agentPhoneNo) agentInfo.phoneNo = agentPhoneNo;
  if (agentEmail) agentInfo.email = agentEmail;
  if (Object.keys(agentInfo).length > 0) body.agentInfo = agentInfo;

  const signature = await PaytmChecksum.generateSignature(JSON.stringify(body), keySecret);
  const payload = {
    body,
    head: { tokenType: 'AES', signature, channelId: 'WEB' },
  };

  const url = buildUrl(bundle.authData.environment, '/refund/apply');

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = response.json;
  const resultBody = data.body || data;
  return { id: refId, refId, orderId, txnId, refundAmount, ...resultBody };
};

module.exports = {
  key: 'create_refund',
  noun: 'Refund',
  display: {
    label: 'Create Refund',
    description: 'Create full or partial refunds.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'orderId',
        label: 'Order ID',
        type: 'string',
        required: true,
        dynamic: 'orders_dropdown.orderId.merchantOrderId',
        helpText:
          'Paytm **order ID** (`orderId`). Load from dropdown (recent **successful** orders, last ~30 days, same Passbook API as **Fetch All Orders**) or paste. ' +
          'For a narrower range or filters, run **Fetch All Orders** first and map this field.',
      },
      {
        key: 'txnId',
        label: 'Transaction ID',
        type: 'string',
        required: true,
        dynamic: 'orders_dropdown.txnId.merchantOrderId',
        helpText:
          'Paytm **transaction ID** (`txnId`) for this order. Dropdown uses the **Fetch All Orders** payload (Passbook rows); if `txnId` is missing from a row, paste the ID from the Paytm dashboard or a prior webhook step.',
      },
      {
        key: 'refId',
        label: 'Refund reference ID',
        type: 'string',
        required: true,
        helpText: 'Merchant unique reference ID for this refund.',
      },
      {
        key: 'txnType',
        label: 'Transaction type',
        type: 'string',
        required: true,
        choices: { REFUND: 'Refund' },
        default: 'REFUND',
      },
      {
        key: 'refundAmount',
        label: 'Refund amount',
        type: 'number',
        required: true,
        helpText: 'Enter value lower-than-equal-to the order amount to initiate refund.',
      },
      {
        key: 'comments',
        label: 'Comments',
        type: 'string',
        required: false,
        helpText: 'Refund reason.',
      },
      {
        key: 'disableMerchantDebitRetry',
        label: 'Disable merchant debit retry',
        type: 'boolean',
        default: 'false',
        required: false,
        helpText: 'Enable automatic debit retry if refund fails.',
      },
      {
        key: 'agentName',
        label: 'Agent name',
        type: 'string',
        required: false,
        helpText: 'Name of agent initiating the refund.',
      },
      {
        key: 'agentPhoneNo',
        label: 'Agent mobile',
        type: 'string',
        required: false,
        helpText: 'Mobile number of agent initiating the refund.',
      },
      {
        key: 'agentEmail',
        label: 'Agent email',
        type: 'string',
        required: false,
        helpText: 'Email ID of agent initiating the refund.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'refId', label: 'Refund Reference ID' },
      { key: 'orderId', label: 'Order ID' },
      { key: 'txnId', label: 'Transaction ID' },
      { key: 'refundAmount', label: 'Refund Amount' },
      { key: 'status', label: 'Status' },
      { key: 'refundId', label: 'Paytm Refund ID' },
    ],
    sample: {
      id: 'REF12345',
      refId: 'REF12345',
      orderId: 'ORDER12345',
      txnId: 'TXN12345',
      refundAmount: '50.00',
      status: 'SUCCESS',
      refundId: 'PAYTMREFUND12345',
    },
  },
};
