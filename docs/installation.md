# Run CapMoney locally

Requirements: Node.js 22.12 or newer. MongoDB is optional for local development because the project can start its own persistent replica set. A real MongoDB Atlas URI is required for deployment.

```powershell
npm install
npm run setup
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://127.0.0.1:4000/api/health`.

The local mail transport writes verification messages to `.local/mail`. Set `MAIL_TRANSPORT=smtp` and the SMTP variables in `.env` when a real mail provider is available. Set `MONGO_URI` to an Atlas replica-set URI to bypass the local database.

Useful checks:

```powershell
npm run typecheck
npm run build
npm test
```
