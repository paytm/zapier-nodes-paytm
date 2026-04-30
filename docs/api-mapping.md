# Paytm API Mapping — zapier-nodes-paytm

> Source of truth: [paytm/n8n-nodes-paytm](https://github.com/paytm/n8n-nodes-paytm)
> Zapier Repo: [paytm/zapier-nodes-paytm](https://github.com/paytm/zapier-nodes-paytm)
> Parent Jira: PG-4647

---

## Auth Type

Zapier `custom` auth. Three fields:
| Field | Type | Notes |
|-------|------|-------|
| `merchantId` | string | Paytm MID |
| `keySecret` | password | 16-byte AES-128-CBC key |
| `environment` | string | `production` or `staging` |

**Base URLs:**
- Production: `https://secure.paytmpayments.com`
- Staging: `https://securestage.paytmpayments.com`

**Signing algorithm:** AES-128-CBC checksum (`src/checksum.js`) — verbatim port of n8n's `checksum.ts`.

---

## Operations

### Resource: Order

| Zapier Key | n8n Operation | HTTP | Endpoint | Auth |
|-----------|---------------|------|----------|------|
| `fetchOrderList` | `fetchOrderList` | POST | `/merchant-passbook/search/list/order/v2` | Checksum [C] |
| `orderDetail` | `orderDetail` | POST | `/merchant-adapter/internal/ORDER_DETAIL?mid={mid}` | Settlement [S] |

#### fetchOrderList — Request Body
```json
{
  "body": {
    "mid": "...",
    "fromDate": "YYYY-MM-DDTHH:mm:ss+05:30",
    "toDate": "YYYY-MM-DDTHH:mm:ss+05:30",
    "orderSearchType": "ALL|TRANSACTION|CANCEL|REFUND|CHARGEBACK|TRANSFER_TO_BANK|M2B|REPAYMENT|TRANSFER_FOR_SETTLEMENT",
    "orderSearchStatus": "SUCCESS|FAILURE|PENDING",
    "pageNumber": 1,
    "pageSize": 20,
    "isSort": true,
    "merchantOrderId": "(optional)",
    "payMode": "(optional)"
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```
> Note: When user selects "ALL" for orderSearchStatus, the API receives `SUCCESS|FAILURE|PENDING` (Paytm does not accept literal "ALL").

#### orderDetail — Request Envelope
Settlement envelope (see Settlement section below). Body params:
- `ipRoleId` = merchantId
- `bizOrderId` (required)
- `isSettlementInfo` (optional boolean)
- `excludePaymentsData` (optional boolean)

---

### Resource: Payment Link

| Zapier Key | n8n Operation | HTTP | Endpoint | Auth |
|-----------|---------------|------|----------|------|
| `fetchPaymentLinks` | `fetchPaymentLinks` | POST | `/link/fetch` | Checksum [C] |
| `fetchTransactionsForLink` | `fetchTransactionsForLink` | POST | `/link/fetchTransaction` | Checksum [C] |
| `createPaymentLink` | `createPaymentLink` | POST | `/link/create` | Checksum [C] |

#### fetchPaymentLinks — Request Body
```json
{
  "body": {
    "mid": "...",
    "merchantRequestId": "(optional)",
    "linkId": "(optional)",
    "searchFilterRequestBody": {
      "fromDate": "DD/MM/YYYY",
      "toDate": "DD/MM/YYYY",
      "isActive": true
    },
    "linkTypeMultiple": ["FIXED"],
    "customerName": "(optional)",
    "customerPhone": "(optional)",
    "customerEmail": "(optional)",
    "paymentStatus": "EXPIRED|INIT|PAID|PENDING",
    "resellerId": "(optional)",
    "resellerName": "(optional)"
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```

#### fetchTransactionsForLink — Request Body
```json
{
  "body": {
    "mid": "...",
    "linkId": "(required)",
    "searchStartDate": "DD/MM/YYYY HH:MM:SS (optional)",
    "searchEndDate": "DD/MM/YYYY HH:MM:SS (optional)",
    "fetchAllTxns": false
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```

#### createPaymentLink — Request Body
```json
{
  "body": {
    "mid": "...",
    "linkName": "(max 64 chars)",
    "linkDescription": "(max 30 chars)",
    "linkType": "FIXED|GENERIC",
    "amount": 100,
    "maxPaymentsAllowed": 1,
    "partialPayment": "false",
    "bindLinkIdMobile": false,
    "sendSms": false,
    "sendEmail": false,
    "customerContact": {
      "customerName": "(optional)",
      "customerEmail": "(optional)",
      "customerMobile": "(optional)"
    },
    "merchantRequestId": "(optional)",
    "customerId": "(optional)",
    "expiryDate": "DD/MM/YYYY (optional)",
    "linkNotes": "(optional)",
    "statusCallbackUrl": "(optional)"
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```

---

### Resource: Refund

| Zapier Key | n8n Operation | HTTP | Endpoint | Auth |
|-----------|---------------|------|----------|------|
| `fetchRefundList` | `fetchRefundList` | POST | `/merchant-passbook/api/v1/refundList` | Checksum [C] |
| `checkRefundStatus` | `checkRefundStatus` | POST | `/v2/refund/status` | Checksum [C] |
| `initiateRefund` | `initiateRefund` | POST | `/refund/apply` | Checksum [C] |

#### fetchRefundList — Request Body
```json
{
  "body": {
    "mid": "...",
    "startDate": "YYYY-MM-DDTHH:mm:ss+05:30",
    "endDate": "YYYY-MM-DDTHH:mm:ss+05:30",
    "pageNum": 1,
    "pageSize": 20,
    "isSort": true
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```
> Response shape is **not** wrapped in `body` — top-level `status` and `errorMessage` fields.

#### initiateRefund — Request Body
```json
{
  "body": {
    "mid": "...",
    "txnType": "REFUND",
    "orderId": "(required)",
    "txnId": "(required)",
    "refId": "(required)",
    "refundAmount": "10.00",
    "comments": "(optional)",
    "disableMerchantDebitRetry": false,
    "agentInfo": {
      "employeeId": "(optional)",
      "name": "(optional)",
      "phoneNo": "(optional)",
      "email": "(optional)"
    }
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```

---

### Resource: Settlement

All settlement operations use the **Settlement Envelope [S]** format (different from checksum APIs):

```json
{
  "requestId": "<uuid>",
  "payload": {
    "head": {
      "reqTime": "YYYY-MM-DDTHH:mm:ss+05:30",
      "reqMsgId": "<uuid>",
      "tokenType": "AES",
      "signature": "<checksum of payload.body as JSON string>",
      "channelId": "WEB"
    },
    "body": {
      "merchantId": "<mid>",
      "ipRoleId": "<mid>",
      ...operationSpecificFields
    }
  }
}
```

URL pattern: `POST /merchant-adapter/internal/{FUNCTION_NAME}?mid={mid}`

| Zapier Key | n8n Operation | Function Name |
|-----------|---------------|---------------|
| `settlementTxnListByDate` | `settlementTxnListByDate` | `TxnListByDate` |
| `settlementBillList` | `settlementBillList` | `BILL_LIST` |
| `orderDetail` | `orderDetail` | `ORDER_DETAIL` |

#### settlementTxnListByDate — Inner Body Fields
- `ipRoleId` = merchantId
- `settlementStartTime` (ISO, required)
- `settlementEndTime` (ISO, required)
- `pageNum` default 1
- `pageSize` default 20
- `settlementOrderId` (optional)

#### settlementBillList — Inner Body Fields
- `ipRoleId` = merchantId
- `settlementStartTime` (required)
- `settlementEndTime` (required)
- `pageNum` default 1
- `pageSize` default 20, max 50
- `isSort` = true (always)
- `isFilterZeroAmount` = true (always)
- `isEventFlow` = true (always)
- `settlementBillId` (optional — payout ID)
- `utrNo` (optional)
- `settleStatus`: `BANK_INITIATED|PAYOUT_SETTLED|PAYOUT_UNSETTLED|WAIT_FOR_SETTLE` (optional)

---

### Resource: Subscription

| Zapier Key | n8n Operation | HTTP | Endpoint | Auth |
|-----------|---------------|------|----------|------|
| `fetchSubscriptionStatus` | `fetchSubscriptionStatus` | POST | `/subscription/subscription/checkStatus` | Checksum [C] |
| `pauseResumeSubscription` | `pauseResumeSubscription` | POST | `/subscription/subscription/status/modify` | Checksum [C] |
| `cancelSubscription` | `cancelSubscription` | POST | `/subscription/subscription/cancel` | Checksum [C] |

#### fetchSubscriptionStatus — Request Body
```json
{
  "body": {
    "mid": "...",
    "subsId": "(at least one of subsId/orderId/linkId required)",
    "orderId": "(optional)",
    "linkId": "(optional)",
    "custId": "(optional)"
  },
  "head": { "tokenType": "AES", "signature": "...", "channelId": "WEB" }
}
```

---

## Checksum Algorithm

All [C] operations sign `JSON.stringify(body)` using AES-128-CBC:
1. Generate 4-byte random salt → base64
2. SHA-256(`params + "|" + salt`) → hex string
3. Append salt → `hash + salt`
4. AES-128-CBC encrypt with IV `@@@@&&&&####$$$$`

See `src/checksum.js` (verbatim port from n8n `checksum.ts`).
