import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { archiveWallet, createTransaction, createWallet, deleteTransaction, deleteWallet, listTransactions, listWallets, transactionImage, updateTransaction, updateWallet } from '../controllers/financeController.js';
import { imageUpload } from '../middleware/upload.js';

export const financeRouter = Router(); financeRouter.use(requireAuth);
financeRouter.get('/wallets', listWallets); financeRouter.post('/wallets', createWallet); financeRouter.patch('/wallets/:id', updateWallet); financeRouter.patch('/wallets/:id/archive', archiveWallet); financeRouter.delete('/wallets/:id', deleteWallet);
financeRouter.get('/transactions', listTransactions); financeRouter.post('/transactions', imageUpload.single('image'), createTransaction); financeRouter.put('/transactions/:id', imageUpload.single('image'), updateTransaction); financeRouter.delete('/transactions/:id', deleteTransaction); financeRouter.get('/transactions/:id/image', transactionImage);
