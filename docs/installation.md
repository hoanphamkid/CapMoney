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

## Device backups

Open **Đồng bộ** on the calendar screen, or **Cài đặt → Đồng bộ & bản sao**. Both devices must use the same website/API and sign in to the same server account. A phone cannot reach the laptop API through the phone's `localhost`; use a shared deployment or a frontend exposed on the same LAN with `/api` proxied to the backend.

Choose **Tạo bản sao lên web** on the source device. Each version includes its source device, server timestamp, wallet/transaction/reminder counts and browser preferences. Existing browser-only data can be uploaded by choosing **Dữ liệu lưu trên thiết bị này**. Backup creation saves a version without replacing the current web data.

On the other device, select a version and choose **Lưu bản sao & cập nhật**. The backend replaces this account's wallets, transactions, embedded receipt images, reminders and profile in a MongoDB transaction. It first saves a recovery version. Browser preferences (budgets, savings jars, debts, subscriptions, challenges, theme and reminders) are applied on the receiving device, then the page reloads. Existing account credentials and other users' data are preserved. Failed browser preference writes can be retried from the sync screen.

Versions persist in MongoDB and are listed with pagination; the screen refreshes the latest versions every 15 seconds while visible. It also shows the device's last restore and the 20 latest restore events, using Vietnam time (GMT+7). Each snapshot supports up to 12MB, including embedded images. This feature requires the updated backend and a replica set (Atlas or the development replica set); it does not send account snapshots to a public notification service.

The backend backup tests start an isolated MongoDB replica set. They use `MONGOMS_SYSTEM_BINARY` when supplied, try the supported Windows MongoDB installations, and otherwise use the binary managed by `mongodb-memory-server`.
