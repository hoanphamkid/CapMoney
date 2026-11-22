export type CategoryOption = { id: string; label: string };

export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { id: 'food', label: 'Ăn uống' },
  { id: 'shopping', label: 'Mua sắm' },
  { id: 'beauty', label: 'Làm đẹp' },
  { id: 'household', label: 'Gia vị & đồ dùng nhà' },
  { id: 'transport', label: 'Di chuyển' },
  { id: 'bills', label: 'Hóa đơn' },
  { id: 'entertainment', label: 'Giải trí' },
  { id: 'health', label: 'Sức khỏe' },
  { id: 'other', label: 'Khác' },
];

export const INCOME_CATEGORIES: CategoryOption[] = [
  { id: 'salary', label: 'Lương' },
  { id: 'bonus', label: 'Thưởng' },
  { id: 'investment', label: 'Đầu tư' },
  { id: 'gift', label: 'Được tặng' },
  { id: 'other', label: 'Thu khác' },
];

export const LEGACY_BEAUTY_CATEGORY_IDS = ['skincare', 'makeup', 'haircare', 'bodycare', 'fragrance', 'nails'];

export function normalizeCategoryId(value?: string) {
  return value && LEGACY_BEAUTY_CATEGORY_IDS.includes(value) ? 'beauty' : value ?? 'other';
}

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map(item => [item.id, item.label]));
export const INCOME_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(INCOME_CATEGORIES.map(item => [item.id, item.label]));
export const ALL_CATEGORY_LABELS: Record<string, string> = {
  ...CATEGORY_LABELS,
  ...INCOME_CATEGORY_LABELS,
  ...Object.fromEntries(LEGACY_BEAUTY_CATEGORY_IDS.map(id => [id, 'Làm đẹp'])),
  transfer: 'Chuyển ví',
};
export const TRANSACTION_CATEGORIES: CategoryOption[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES.filter(item => !EXPENSE_CATEGORIES.some(expense => expense.id === item.id))];

