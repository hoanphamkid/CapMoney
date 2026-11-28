export function formatVNDate(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}

export function buildDateKeys(days: number) {
  const list: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return list;
}
