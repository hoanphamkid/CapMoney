export const PRO_SETTINGS_PATH = '/app/settings?section=pro';

export type ProOrder = {
  code: string;
  amount: number;
  bankName: string;
  accountName?: string;
  accountNumber: string;
};

export type ProCheckout =
  | { status: 'unavailable'; price?: number }
  | { status: 'available'; price: number }
  | { status: 'pending'; order: ProOrder }
  | { status: 'paid' };

export const PRO_FEATURES = {
  week: { title: 'Kế hoạch tuần', detail: 'Theo dõi ngân sách tuần và số tiền có thể chi mỗi ngày.' },
  split: { title: 'Chia bill nhóm', detail: 'Tính phần của mỗi người, thêm tiền tip và sao chép kết quả.' },
} as const;
