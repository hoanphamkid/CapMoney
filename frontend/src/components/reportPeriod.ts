export const REPORT_PERIODS = [
  { days: 1, label: '1 ngày' },
  { days: 7, label: '1 tuần' },
  { days: 30, label: '1 tháng' },
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export type ReportRange = { from: string; to: string };

export function reportDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function offsetReportDay(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return reportDayKey(date);
}

export function reportRange(period: ReportPeriod, today: string): ReportRange {
  return { from: offsetReportDay(today, 1 - period.days), to: today };
}

export function isInReportRange(date: string, range: ReportRange) {
  return date >= range.from && date <= range.to;
}

export function reportRangeLabel(range: ReportRange) {
  const dateLabel = (key: string) => key.split('-').reverse().join('/');
  return range.from === range.to ? dateLabel(range.from) : `${dateLabel(range.from)} – ${dateLabel(range.to)}`;
}
