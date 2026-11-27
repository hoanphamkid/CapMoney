# CapMoney Web

CapMoney is a privacy-first personal finance workspace. This repository is being developed in phases; Phase 1 provides a real React/Vite client, Express API, MongoDB-backed accounts, secure sessions, responsive authentication screens and the first signed-in dashboard shell.

Read [docs/installation.md](docs/installation.md) to run it locally and [docs/api.md](docs/api.md) for the API contract. The complete product plan and module list are captured in the supplied master specification; implementation proceeds only after the preceding financial workflows are verified.

For automatic MB Bank transactions, see [MB Bank sync setup](docs/mbbank-sync.md), including outgoing-payment support and the required account mapping.

## CapMoney Pro

Pro is unlocked by a one-time transfer of 5,000 VND. Deploy the checkout and MB Bank webhook against the same MongoDB database. With a configured MB Bank integration and no dedicated Pro account, checkout uses `MBBANK_ACCOUNT_NUMBER` and the authenticated incoming JSON webhook automatically. `PRO_PAYMENT_USE_MBBANK_SYNC=true` explicitly selects this integration. [MB Bank sync setup](docs/mbbank-sync.md)

For a separate receiving account, leave `PRO_PAYMENT_USE_MBBANK_SYNC` empty or set it to `false`, set `PRO_PAYMENT_BANK_NAME` to the bank's SePay gateway name, and set `PRO_PAYMENT_ACCOUNT_NUMBER`. Set `PRO_SEPAY_WEBHOOK_SECRET` to the API key for the incoming-transfer JSON webhook at `/api/webhooks/pro`. The account holder display name can be set independently with `PRO_PAYMENT_ACCOUNT_NAME`. [SePay webhook setup](https://docs.sepay.vn/tich-hop-webhooks.html)

Each account receives its own transfer code. Checkout stays pending until the authenticated webhook matches the bank, receiving account, amount and transfer code. MB Bank payments are also recorded normally in the existing bank ledger.
