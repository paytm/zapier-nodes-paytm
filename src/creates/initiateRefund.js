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

  const body = {
    mid,
    txnType: 'REFUND',
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
  key: 'initiateRefund',
  noun: 'Refund',
  display: {
    label: 'Initiate Refund',
    description: 'Initiates a refund for a completed Paytm transaction.',
  },
  operation: {
    inputFields: [
      {
        key: 'orderId',
        label: 'Order ID',
        type: 'string',
        required: true,
        helpText: 'The original Paytm order ID for which the refund is being initiated.',
      },
      {
        key: 'txnId',
        label: 'Transaction ID',
        type: 'string',
        required: true,
        helpText: 'The Paytm transaction ID for the payment to be refunded.',
      },
      {
        key: 'refId',
        label: 'Refund Reference ID',
        type: 'string',
        required: true,
        helpText: 'Your unique reference ID for this refund (used for deduplication and status checks).',
      },
      {
        key: 'refundAmount',
        label: 'Refund Amount (₹)',
        type: 'number',
        required: true,
        helpText: 'Amount to refund. Sent to two decimal places e.g. 10.00.',
      },
      {
        key: 'comments',
        label: 'Comments',
        type: 'string',
        required: false,
        helpText: 'Optional reason or notes for the refund.',
      },
      {
        key: 'disableMerchantDebitRetry',
        label: 'Disable Merchant Debit Retry',
        type: 'boolean',
        required: false,
        helpText:
          'When true, disables automatic retry of merchant debit if refund fails.',
      },
      {
        key: 'agentEmployeeId',
        label: 'Agent: Employee ID',
        type: 'string',
        required: false,
        helpText: 'Optional: ID of the agent initiating this refund.',
      },
      {
        key: 'agentName',
        label: 'Agent: Name',
        type: 'string',
        required: false,
      },
      {
        key: 'agentPhoneNo',
        label: 'Agent: Phone Number',
        type: 'string',
        required: false,
      },
      {
        key: 'agentEmail',
        label: 'Agent: Email',
        type: 'string',
        required: false,
      },
    ],
    perform,
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
