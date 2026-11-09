# Database Design

All user-owned documents carry `userId` or an explicit ownership relation. Monetary values will be stored as integer minor units (`amountMinor`) with a currency code; this avoids JavaScript floating-point errors. Wallet balance changes will be written together with transactions inside a MongoDB session.

Initial collections:

| Collection | Ownership | Purpose |
| --- | --- | --- |
| `users` | root | Login identity, role and account status |
| `profiles` | `userId` | Name preferences, locale and currency |
| `sessions` | `userId` | Hashed refresh sessions and device metadata |
| `wallets` | `userId` | Cash, bank, savings and other accounts |
| `transactions` | `userId` | Income, expense and linked transfers |
| `categories` | `userId` | Default and custom income/expense categories |
| `budgets` | `userId` | Period/category spending limits |
| `receipts` | `userId` | Private images and normalized OCR results |
| `recurringTransactions` | `userId` | Idempotent scheduled entries |
| `debts`, `loans` | `userId` | Payable and receivable obligations |
| `savingsGoals`, `savingsContributions` | `userId` | Goals and contributions |
| `groups`, `groupMembers`, `groupTransactions` | group membership | Shared expenses and settlement |
| `notifications` | `userId` | In-app reminders and system events |
| `userSettings` | `userId` | UI, privacy and notification preferences |
| `auditLogs` | actor/user relation | Security and admin events |
| `subscriptions`, `paymentHistory` | `userId` | Freemium billing state |
| `ocrJobs` | `userId` | Asynchronous OCR status and retries |

Required indexes include `(userId, transactionDate)`, `(userId, walletId)`, `(userId, categoryId)`, and unique `(userId, idempotencyKey)` for mutation endpoints.
