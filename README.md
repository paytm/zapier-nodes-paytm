# zapier-nodes-paytm

Official Zapier CLI integration for Paytm Payments.

**Feature parity target:** 1:1 with [n8n-nodes-paytm v1.6.1](https://github.com/paytm/n8n-nodes-paytm)

---

## Supported Operations (13 total)

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

Settlement operations use a different envelope format — see `docs/api-mapping.md`.

---

## Setup

```bash
npm install
npx zapier login
npx zapier register "Paytm"   # or link to existing app
npx zapier push
```

### Run tests

```bash
npm test
```

Tests cover: checksum algorithm, date formatters, URL builder, and module structure assertions for all 13 operations.

### Local validation

```bash
npx zapier validate
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
└── creates/            # Write operations (2 modules + 2 mutations in searches/)
    ├── createPaymentLink.js
    └── initiateRefund.js
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
