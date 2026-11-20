import { authenticatedRequest } from './api';

export type LoanKind = 'borrow' | 'lend';
export type LoanDetails = {
  kind: LoanKind;
  person: string;
  amount: number;
  openedOn: string;
  dueOn: string | null;
  note: string;
};
export type LoanPayment = { id: string; amount: number; date: string; note: string };
export type Loan = LoanDetails & { id: string; payments: LoanPayment[] };

export const loansApi = {
  list: () => authenticatedRequest<{ loans: Loan[] }>('/loans'),
  create: (id: string, details: LoanDetails) => authenticatedRequest<{ loan: Loan }>('/loans', {
    method: 'POST', body: JSON.stringify({ id, ...details }),
  }),
  update: (id: string, details: LoanDetails) => authenticatedRequest<{ loan: Loan }>(`/loans/${id}`, {
    method: 'PATCH', body: JSON.stringify(details),
  }),
  pay: (id: string, payment: LoanPayment) => authenticatedRequest<{ loan: Loan }>(`/loans/${id}/payments`, {
    method: 'POST', body: JSON.stringify(payment),
  }),
  remove: (id: string) => authenticatedRequest<void>(`/loans/${id}`, { method: 'DELETE' }),
};
