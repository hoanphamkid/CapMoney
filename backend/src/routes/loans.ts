import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { LoanModel, loanId, loanInput, loanKey, paymentInput, publicLoan } from '../models/Loan.js';

export const loansRouter = Router();
loansRouter.use(requireAuth);
loansRouter.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

function validateDates(input: z.infer<typeof loanInput>) {
  if (input.dueOn && input.dueOn < input.openedOn) {
    throw new AppError(400, 'Hạn trả phải từ ngày phát sinh trở đi.', 'LOAN_INVALID_DUE_DATE');
  }
}

loansRouter.get('/', async (request, response) => {
  const rows = await LoanModel.find({ userId: request.user!.id }).sort({ openedOn: -1, _id: -1 }).lean();
  response.json({ loans: rows.map(publicLoan) });
});

loansRouter.post('/', async (request, response) => {
  const { id, ...input } = loanInput.extend({ id: loanId }).parse(request.body);
  validateDates(input);
  const key = loanKey(request.user!.id, id);
  const row = await LoanModel.findOneAndUpdate(key, { $setOnInsert: input }, { upsert: true, new: true }).lean();
  response.status(201).json({ loan: publicLoan(row) });
});

loansRouter.patch('/:id', async (request, response) => {
  const key = loanKey(request.user!.id, loanId.parse(request.params.id));
  const input = loanInput.parse(request.body);
  validateDates(input);
  const row = await LoanModel.findOneAndUpdate({
    ...key,
    paid: { $lte: input.amount },
    $or: [{ paid: 0 }, { kind: input.kind }],
    payments: { $not: { $elemMatch: { date: { $lt: input.openedOn } } } },
  }, { $set: input }, { new: true }).lean();
  if (!row) {
    if (!await LoanModel.exists(key)) throw new AppError(404, 'Không tìm thấy khoản vay/mượn.', 'LOAN_NOT_FOUND');
    throw new AppError(409, 'Thông tin mới không khớp với lịch sử thanh toán.', 'LOAN_PAYMENT_CONFLICT');
  }
  response.json({ loan: publicLoan(row) });
});

loansRouter.post('/:id/payments', async (request, response) => {
  const key = loanKey(request.user!.id, loanId.parse(request.params.id));
  const payment = paymentInput.parse(request.body);
  const row = await LoanModel.findOneAndUpdate({
    ...key,
    openedOn: { $lte: payment.date },
    'payments.id': { $ne: payment.id },
    'payments.999': { $exists: false },
    $expr: { $gte: [{ $subtract: ['$amount', '$paid'] }, payment.amount] },
  }, { $push: { payments: { $each: [payment], $position: 0 } }, $inc: { paid: payment.amount } }, { new: true }).lean();
  if (row) {
    response.status(201).json({ loan: publicLoan(row) });
    return;
  }
  const current = await LoanModel.findOne(key).lean();
  if (!current) throw new AppError(404, 'Không tìm thấy khoản vay/mượn.', 'LOAN_NOT_FOUND');
  if (current.payments.some(item => item.id === payment.id)) {
    response.json({ loan: publicLoan(current) });
    return;
  }
  throw new AppError(409, 'Kiểm tra ngày thanh toán và số tiền còn lại rồi thử lại.', 'LOAN_PAYMENT_CONFLICT');
});

loansRouter.delete('/:id', async (request, response) => {
  const key = loanKey(request.user!.id, loanId.parse(request.params.id));
  if (!await LoanModel.findOneAndDelete({ ...key, paid: 0 }) && await LoanModel.exists(key)) {
    throw new AppError(409, 'Khoản này đã có lịch sử thanh toán.', 'LOAN_HAS_PAYMENTS');
  }
  response.status(204).end();
});
