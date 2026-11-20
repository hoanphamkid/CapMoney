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
export type LoanPhoto = { id: string; url: string };
export type Loan = LoanDetails & { id: string; payments: LoanPayment[]; photos?: LoanPhoto[] };
export const MAX_LOAN_PHOTOS = 10;
const MAX_JPEG_LENGTH = 524_288;

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
  addPhoto: (id: string, photo: { id: string; jpeg: string }) => authenticatedRequest<{ loan: Loan }>(`/loans/${id}/photos`, {
    method: 'POST', body: JSON.stringify(photo),
  }),
  removePhoto: (id: string, photoId: string) => authenticatedRequest<{ loan: Loan }>(`/loans/${id}/photos/${photoId}`, {
    method: 'DELETE',
  }),
  remove: (id: string) => authenticatedRequest<void>(`/loans/${id}`, { method: 'DELETE' }),
};

export async function encodeLoanPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error('Không đọc được ảnh. Hãy thử chọn ảnh JPG, PNG hoặc WEBP.');
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Thiết bị chưa thể xử lý ảnh.');

    for (const maxDimension of [1600, 1200, 900]) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.83);
      const jpeg = dataUrl.slice('data:image/jpeg;base64,'.length);
      if (dataUrl.startsWith('data:image/jpeg;base64,') && jpeg.length <= MAX_JPEG_LENGTH) return jpeg;
    }
    throw new Error('Ảnh vẫn quá lớn sau khi thu gọn. Hãy chọn ảnh nhỏ hơn.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
