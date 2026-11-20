import { model, Schema } from 'mongoose';
import { z } from 'zod';

export const loanId = z.string().uuid();
export const loanAmount = z.number().int().positive().max(1_000_000_000_000);
const date = z.iso.date();
const note = z.string().trim().max(500).default('');

export const loanInput = z.object({
  kind: z.enum(['borrow', 'lend']),
  person: z.string().trim().min(1).max(100),
  amount: loanAmount,
  openedOn: date,
  dueOn: date.nullable(),
  note,
});

export const paymentInput = z.object({ id: loanId, amount: loanAmount, date, note });
export const loanSnapshot = loanInput.extend({ id: loanId, payments: z.array(paymentInput).max(1000) }).superRefine((loan, context) => {
  if (loan.dueOn && loan.dueOn < loan.openedOn) {
    context.addIssue({ code: 'custom', path: ['dueOn'], message: 'Hạn trả phải từ ngày phát sinh trở đi.' });
  }
  if (loan.payments.reduce((sum, payment) => sum + payment.amount, 0) > loan.amount
    || loan.payments.some(payment => payment.date < loan.openedOn)
    || new Set(loan.payments.map(payment => payment.id)).size !== loan.payments.length) {
    context.addIssue({ code: 'custom', path: ['payments'], message: 'Lịch sử thanh toán chưa hợp lệ.' });
  }
});

type LoanSnapshot = z.infer<typeof loanSnapshot>;
type StoredLoan = Omit<LoanSnapshot, 'id'> & { _id: string; entryId: string; userId: string; paid: number };

const paymentSchema = new Schema<LoanSnapshot['payments'][number]>({
  id: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  note: { type: String, default: '' },
}, { _id: false });

const schema = new Schema<StoredLoan>({
  _id: { type: String, required: true },
  userId: { type: String, required: true },
  entryId: { type: String, required: true },
  kind: { type: String, enum: ['borrow', 'lend'], required: true },
  person: { type: String, required: true },
  amount: { type: Number, required: true },
  openedOn: { type: String, required: true },
  dueOn: { type: String, default: null },
  note: { type: String, default: '' },
  paid: { type: Number, default: 0 },
  payments: { type: [paymentSchema], default: [] },
});
schema.index({ userId: 1, openedOn: -1 });

export const LoanModel = model('Loan', schema);

export function loanKey(userId: string, entryId: string) {
  return { _id: userId + ':' + entryId, userId, entryId };
}

export function publicLoan(loan: StoredLoan): LoanSnapshot {
  const { entryId, kind, person, amount, openedOn, dueOn, note, payments } = loan;
  return { id: entryId, kind, person, amount, openedOn, dueOn, note, payments };
}
