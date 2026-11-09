# API Surface

## Phase 1

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Liveness check |
| `POST` | `/api/auth/register` | No | Create account and session |
| `POST` | `/api/auth/login` | No | Authenticate account |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotate access cookie |
| `POST` | `/api/auth/logout` | Optional | Revoke current session |
| `GET` | `/api/auth/me` | Yes | Current user and profile |
| `GET` | `/api/auth/sessions` | Yes | Active devices |
| `DELETE` | `/api/auth/sessions/others` | Yes | Revoke other devices |

## Planned modules

`/api/wallets`, `/api/transactions`, `/api/categories`, `/api/budgets`, `/api/reports`, `/api/receipts`, `/api/ocr/jobs`, `/api/recurring`, `/api/debts`, `/api/loans`, `/api/savings`, `/api/groups`, `/api/notifications`, `/api/search`, `/api/import`, `/api/export`, `/api/settings`, `/api/admin`.

Calendar and capture endpoints are live in this phase. `GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&filters=expense,reminder` returns normalized events, per-day groups and monthly statistics. `GET /api/calendar/day/:date` returns the selected day's detail. `POST /api/calendar/reminders`, `PUT /api/calendar/reminders/:id` and `DELETE /api/calendar/reminders/:id` manage reminders. `POST /api/transactions` accepts a multipart `image` field (JPG, PNG or WEBP, max 10MB); images are stored privately in local development and referenced by URL in MongoDB. `GET /api/transactions/:id/image` enforces transaction ownership before streaming the image.

Every mutation will accept an idempotency key and return a stable resource identifier. Error responses use `{ error: { code, message, details? } }`.

The capture form generates an idempotency key with `crypto.randomUUID()` for each new transaction. Retrying the same request therefore returns the original transaction instead of changing the wallet balance twice.
