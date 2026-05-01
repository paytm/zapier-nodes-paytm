# zapier-nodes-paytm

Official Zapier CLI integration for Paytm Payments.

**Feature parity target:** 1:1 with [n8n-nodes-paytm v1.6.1](https://github.com/paytm/n8n-nodes-paytm)

---

## Connecting Your Paytm Account

1. Open your Zap and click **Sign in** under the Paytm app.
2. Enter your credentials from the [Paytm Dashboard → API Keys](https://dashboard.paytmpayments.com/next/apikeys):
   - **Merchant ID** — your MID (e.g. `PAYTM12345678901`)
   - **Key Secret** — your AES key, must be exactly 16 bytes
   - **Environment** — choose `staging` for testing, `production` for live transactions
3. Click **Yes, Continue**. Zapier will run a test order-list call to verify the credentials.

> **Staging vs Production:** Staging uses `securestage.paytmpayments.com`. Settlement operations (`Settlement: Transaction List`, `Settlement: Bill List`, `Order Detail`) will return empty results in staging as settlement data is only available in production.

---

## Supported Operations (14 total)

| # | Zapier Key | Category | Type | Endpoint |
|---|-----------|----------|------|----------|
| 1 | `fetchOrderList` | Order | Search | `POST /merchant-passbook/search/list/order/v2` |
| 2 | `orderDetail` | Order | Search | `POST /merchant-adapter/internal/ORDER_DETAIL` |
| 3 | `fetchPaymentLinks` | Payment Link | Search | `POST /link/fetch` |
| 4 | `fetchTransactionsForLink` | Payment Link | Search | `POST /link/fetchTransaction` |
| 5 | `createPaymentLink` | Payment Link | Create | `POST /link/create` |
| 6 | `fetchRefundList` | Refund | Search | `POST /merchant-passbook/api/v1/refundList` |
| 7 | `checkRefundStatus` | Refund | Search | `POST /v2/refund/status` |
| 8 | `initiateRefund` | Refund | Create | `POST /refund/apply` |
| 9 | `settlementTxnListByDate` | Settlement | Search | `POST /merchant-adapter/internal/TxnListByDate` |
| 10 | `settlementBillList` | Settlement | Search | `POST /merchant-adapter/internal/BILL_LIST` |
| 11 | `fetchSubscriptionStatus` | Subscription | Search | `POST /subscription/subscription/checkStatus` |
| 12 | `pauseResumeSubscription` | Subscription | Create | `POST /subscription/subscription/status/modify` |
| 13 | `cancelSubscription` | Subscription | Create | `POST /subscription/subscription/cancel` |
| 14 | `customApiCall` | Universal | Create | Any Paytm endpoint — path supplied at runtime |

---

## Example Zaps

**Auto-refund failed orders**
Trigger: Schedule (daily) → Search: `fetchOrderList` (status=FAILURE) → Create: `initiateRefund`

**Notify on new payment link payment**
Trigger: Schedule (every 15 min) → Search: `fetchTransactionsForLink` → Filter: status=SUCCESS → Action: Send Slack/email notification

**Daily settlement reconciliation**
Trigger: Schedule (daily 9 AM) → Search: `settlementBillList` → Action: Append rows to Google Sheets

**Pause subscription on failed payment**
Trigger: Webhook (payment failure event) → Create: `pauseResumeSubscription` (status=SUSPENDED) → Action: Send SMS to customer

**Call a custom Paytm endpoint**
Trigger: Schedule → Create: `customApiCall` (endpoint=/v2/refund/status, requestBody={"orderId":"{{orderId}}"}) → Filter on resultStatus

---

## Custom API Call

The `customApiCall` operation is a generic signed passthrough for any Paytm API not covered by the predefined operations.

| Field | Description |
|-------|-------------|
| **API Endpoint** | Paytm path e.g. `/v2/refund/status` — no base URL, it is set by your environment |
| **Request Body (JSON)** | JSON object of fields to send e.g. `{"orderId":"ORDER123"}` — do not include `mid` |
| **Auto-inject Merchant ID** | When true (default), your MID is added to the body before signing |
| **Signing Scheme** | `standard` — AES-CBC body envelope (most APIs). `settlement` — signature as HTTP header (settlement/reporting APIs) |

The response is flattened: all fields from `body` (or `payload.body`) are surfaced as output fields. A stable `id` is derived from the first recognised ID field in the response (`orderId`, `txnId`, `refId`, `linkId`, `subsId`, `requestId`, `id`) or falls back to the current timestamp.

---

## Authentication

Custom auth with three fields:

| Field | Description |
|-------|-------------|
| **Merchant ID** | Your Paytm MID (from the dashboard) |
| **Key Secret** | AES-128-CBC key — must be **exactly 16 bytes** |
| **Environment** | `production` or `staging` |

The app validates the key secret length at connection time and surfaces a clear error if the length is wrong.

### How signing works

All operations use the Paytm AES-128-CBC checksum algorithm (native Node.js `crypto` — no proxy required):

1. Sort body params, join with `|`
2. SHA-256(params `|` salt) → hex → append salt
3. AES-128-CBC encrypt with IV `@@@@&&&&####$$$$`

Settlement operations (`settlementTxnListByDate`, `settlementBillList`, `orderDetail`) use a different envelope format where the signature is passed as an HTTP header rather than in the request body — see `docs/api-mapping.md`.

---

## Troubleshooting

**"Paytm Key Secret must be exactly 16 bytes"**
Your Key Secret is the wrong length. Copy it directly from [Dashboard → API Keys](https://dashboard.paytmpayments.com/next/apikeys). Watch out for leading/trailing spaces.

**"At least one of Subscription ID, Order ID, or Link ID is required"**
`fetchSubscriptionStatus` needs at least one identifier. Provide `subsId`, `orderId`, or `linkId`.

**Settlement operations return empty results**
Settlement data (`settlementTxnListByDate`, `settlementBillList`) is only available in production. Switch your connected account to `production` environment.

**Auth test fails with HTTP 401**
Your MID and Key Secret don't match, or you've selected the wrong environment. Staging MIDs only work against the staging environment.

**"Refund Amount must be a positive number"**
Pass a numeric value greater than 0. The value is formatted to two decimal places before being sent to Paytm.

**Custom API Call returns unexpected structure**
The operation flattens `payload.body` → `body` → root. If your endpoint uses a different envelope, map fields from the raw response using Zapier's built-in formatter. Use `signingScheme: settlement` only for settlement/reporting endpoints — standard endpoints with that scheme will fail signature verification.

---

## Setup (Developer)

```bash
npm install
nvm use 22
npx zapier login
npx zapier register "Paytm"   # first time only
npx zapier push
```

### Run tests

```bash
npm test
```

103 tests across 4 suites: checksum known vectors, auth key validation, date formatters, URL builder, and module structure assertions for all 14 operations.

### Local validation

```bash
nvm use 22 && npx zapier validate
```

---

## Project Structure

```
src/
├── checksum.js         # AES-128-CBC signing (verbatim from n8n)
├── auth.js             # Custom auth + connection test
├── utils.js            # URL builder, date formatters, settlement envelope
├── searches/           # Read operations (9 modules)
│   ├── fetchOrderList.js
│   ├── fetchPaymentLinks.js
│   ├── fetchTransactionsForLink.js
│   ├── fetchRefundList.js
│   ├── checkRefundStatus.js
│   ├── fetchSubscriptionStatus.js
│   ├── pauseResumeSubscription.js
│   ├── cancelSubscription.js
│   ├── orderDetail.js
│   ├── settlementTxnListByDate.js
│   └── settlementBillList.js
└── creates/            # Write operations (3 modules + 2 mutations in searches/)
    ├── createPaymentLink.js
    ├── initiateRefund.js
    └── customApiCall.js
test/
├── auth.test.js        # Checksum known vectors, key validation, utils
├── operations.test.js  # Structure assertions for all 11 remaining operations
├── creates/
│   └── createPaymentLink.test.js
└── searches/
    └── fetchOrderList.test.js
```

---

## Key Conventions

- **Commit format:** `feat: PG-4647 <what changed>`
- **Branch:** `development` (cut from `main`)
- **Jira parent:** PG-4647

---

## API Reference

See `docs/api-mapping.md` for full request/response shapes for each operation.

Paytm API docs: https://www.paytmpayments.com/docs/getting-started
