import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createTransaction, createWallet, deleteTransaction, listTransactions, listWallets, transactionImage, updateTransaction } from '../controllers/financeController.js';
import { imageUpload } from '../middleware/upload.js';

export const financeRouter = Router(); financeRouter.use(requireAuth);
financeRouter.get('/wallets', listWallets); financeRouter.post('/wallets', createWallet);
financeRouter.get('/transactions', listTransactions); financeRouter.post('/transactions', imageUpload.single('image'), createTransaction); financeRouter.put('/transactions/:id', imageUpload.single('image'), updateTransaction); financeRouter.delete('/transactions/:id', deleteTransaction); financeRouter.get('/transactions/:id/image', transactionImage);
