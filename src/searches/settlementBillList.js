'use strict';

const PaytmChecksum = require('../checksum');
const { buildUrl, formatDateToIst, buildSettlementEnvelope, trimStr, deepConvertDates } = require('../utils');

const SETTLEMENT_PATH = (mid) => `/merchant-adapter/internal/settlementBillList?mid=${mid}`;

const perform = async (z, bundle) => {
  const keySecret = bundle.authData.keySecret;
  const mid = bundle.authData.merchantId;

  const settlementStartTime = formatDateToIst(bundle.inputData.settlementStartTime);
  const settlementEndTime = formatDateToIst(bundle.inputData.settlementEndTime);
  if (!settlementStartTime || !settlementEndTime) {
    throw new z.errors.Error('Settlement Start Time and End Time are required.');
  }

  const businessBody = {
    ipRoleId: mid,
    settlementStartTime,
    settlementEndTime,
    pageNum: Number(bundle.inputData.pageNum) || 1,
    pageSize: Math.min(Number(bundle.inputData.pageSize) || 20, 50), // max 50
    isSort: true,
    isFilterZeroAmount: true,
    isEventFlow: true,
  };

  const settlementBillId = trimStr(bundle.inputData.settlementBillId);
  if (settlementBillId) businessBody.settlementBillId = settlementBillId;

  const utrNo = trimStr(bundle.inputData.utrNo);
  if (utrNo) businessBody.utrNo = utrNo;

  const settleStatus = trimStr(bundle.inputData.settleStatus);
  if (settleStatus) businessBody.settleStatus = settleStatus;

  const outerEnvelope = buildSettlementEnvelope(mid, businessBody);
  const signature = await PaytmChecksum.generateSignature(JSON.stringify(outerEnvelope), keySecret);
  const url = buildUrl(bundle.authData.environment, SETTLEMENT_PATH(mid));

  const response = await z.request({
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json', signature },
    body: JSON.stringify(outerEnvelope),
  });

  const data = response.json;
  const resultBody = (data.payload && data.payload.body) || data.body || data;
  const bills = resultBody.billList || resultBody.settlements || resultBody.data;

  if (Array.isArray(bills)) {
    const items = bills.map((b, i) => ({
      id: b.settlementBillId || b.utrNo || i,
      ...b,
    }));
    return deepConvertDates(items);
  }
  return deepConvertDates([{ id: 'result', ...resultBody }]);
};

module.exports = {
  key: 'fetch_settlement_details',
  noun: 'Settlement',
  display: {
    label: 'Fetch Settlement Details',
    description:
      'Fetch transaction level details for a merchant settlement.',
  },
  operation: {
    cleanInputData: false,
    inputFields: [
      {
        key: 'settlementStartTime',
        label: 'Settlement Start Time',
        type: 'datetime',
        required: true,
        helpText: 'Start of the settlement bill date range.',
      },
      {
        key: 'settlementEndTime',
        label: 'Settlement End Time',
        type: 'datetime',
        required: true,
        helpText: 'End of the settlement bill date range.',
      },
      {
        key: 'pageNum',
        label: 'Page Number',
        type: 'integer',
        default: '1',
        required: false,
      },
      {
        key: 'pageSize',
        label: 'Page Size',
        type: 'integer',
        default: '20',
        required: false,
        helpText: 'Maximum 50 records per page.',
      },
      {
        key: 'utrNo',
        label: 'UTR Number',
        type: 'string',
        required: false,
        helpText: 'Optional: filter by UTR number.',
      },
      {
        key: 'settleStatus',
        label: 'Settlement Status',
        type: 'string',
        choices: ['BANK_INITIATED', 'PAYOUT_SETTLED', 'PAYOUT_UNSETTLED', 'WAIT_FOR_SETTLE'],
        required: false,
        helpText: 'Optional: filter by settlement status.',
      },
    ],
    perform,
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'settlementBillId', label: 'Settlement Bill ID' },
      { key: 'utrNo', label: 'UTR Number' },
      { key: 'settlementAmount', label: 'Settlement Amount' },
      { key: 'settleStatus', label: 'Settlement Status' },
      { key: 'settlementDate', label: 'Settlement Date', type: 'datetime' },
    ],
    sample: {
      id: 'BILL12345',
      settlementBillId: 'BILL12345',
      utrNo: 'UTR12345678',
      settlementAmount: '5000.00',
      settleStatus: 'PAYOUT_SETTLED',
      settlementDate: '2024-01-15',
    },
  },
};
