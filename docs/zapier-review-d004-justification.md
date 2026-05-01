# D004 — Dynamic Dropdown Justification

**For use during Zapier integration review submission.**

---

## Summary

The 25 D004 warnings are on ID fields across 11 operations:
`orderId`, `txnId`, `refId`, `subsId`, `linkId`, `merchantRequestId`, `bizOrderId`, `settlementOrderId`, `settlementBillId`, `custId`, `agentEmployeeId`.

Dynamic dropdowns are not feasible for these fields for the following reasons:

## Reason 1 — No enumeration APIs available

Paytm's merchant-facing API does not expose list/enumeration endpoints suitable for Zapier trigger polling. There are no stable "list all orders", "list all transactions", "list all refunds", or "list all subscriptions" APIs that return paginated, newest-first results with a consistent `id` field — the pattern required to back a Zapier dynamic dropdown.

## Reason 2 — IDs originate outside Zapier

These identifiers are generated and owned by systems external to Zapier:

| Field | Origin |
|-------|--------|
| `orderId`, `merchantOrderId` | Merchant's own order management system |
| `txnId` | Paytm assigns post-payment; received via webhook or dashboard |
| `refId` | Merchant-generated at refund initiation time |
| `subsId` | Paytm assigns at subscription creation; retrieved from dashboard |
| `linkId`, `merchantRequestId` | Merchant assigns at payment link creation |
| `bizOrderId`, `settlementOrderId`, `settlementBillId` | Paytm settlement system |
| `agentEmployeeId` | Merchant's internal HR/support system |

The natural input method for all of these is **field-mapping from a prior Zap step** (e.g., a webhook trigger, database lookup, or prior search result) — not a UI dropdown.

## Reason 3 — Designed for automation pipelines, not manual selection

This integration targets backend automation workflows, not manual data entry. A typical Zap:

- Receives an `orderId` from an upstream webhook or database trigger
- Passes it directly into a search or action field

A dropdown would not serve this use case and would mislead users into thinking they should select from a list rather than map from upstream data.

## Conclusion

All 25 D004 fields are free-text identifier fields intentionally designed for field-mapping from upstream Zap steps. No dynamic dropdown is appropriate.
