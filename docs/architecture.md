# CapMoney Web Architecture

CapMoney is split into a Vite React client and an Express TypeScript API. The browser communicates with the API using JSON over `/api`; authentication is cookie-based so access tokens are never exposed to application JavaScript.

The API owns validation, authorization, financial invariants, file handling and database writes. The client owns navigation, form state, responsive presentation and optimistic UI only where an API response has already been accepted.

## Runtime

```text
Browser (React + Vite) -> Express API -> MongoDB
                                  -> file/S3 receipt storage
                                  -> OCR worker (later phase)
```

Development uses `scripts/dev.mjs`. When `MONGO_URI` is empty it starts a persistent single-node MongoDB replica set under `.local/mongodb`, which supports the transactions needed by wallet and transaction operations in the next phase. Production should use MongoDB Atlas or a replica set URI.

## Authentication

Registration creates a user and profile, hashes the password with scrypt, and creates a session. Login writes a 15-minute HttpOnly access cookie and a 1-day or 30-day refresh cookie. Refresh tokens are stored only as SHA-256 hashes in the `sessions` collection. Every protected route checks both the token and current user status.

## Boundaries

- `frontend/src/components`: reusable visual and interaction components.
- `frontend/src/pages`: route-level screens.
- `frontend/src/services`: API boundary.
- `backend/src/controllers`: HTTP input/output and orchestration.
- `backend/src/models`: MongoDB schemas and indexes.
- `backend/src/services`: integrations such as email and OCR.
- `backend/src/middleware`: authentication and error handling.
