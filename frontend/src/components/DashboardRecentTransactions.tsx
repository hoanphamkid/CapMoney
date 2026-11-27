import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, ChevronDown, Plus, WalletCards } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../services/api';
import { CATEGORY_LABELS, INCOME_CATEGORY_LABELS } from './MonthlyReport';
import { offsetReportDay } from './reportPeriod';

const pageSize = 6;

const flowDetails = {
  income: { Icon: ArrowDownLeft, sign: '+' },
  expense: { Icon: ArrowUpRight, sign: '−' },
  transfer: { Icon: ArrowLeftRight, sign: '' },
} as const;

export function transactionTitle(transaction: Transaction) {
  return transaction.note || (transaction.type === 'income' ? 'Thu nhập' : transaction.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền');
}

export function DashboardRecentTransactions({ transactions, today, filterLabel, onClearFilter, onOpen, onAdd }: {
  transactions: Transaction[];
  today: string;
  filterLabel: string;
  onClearFilter: () => void;
  onOpen: (transaction: Transaction) => void;
  onAdd: () => void;
}) {
  const [limit, setLimit] = useState(pageSize);
  const list = useRef<HTMLDivElement>(null);
  const firstNewIndex = useRef<number | null>(null);

  useEffect(() => {
    const index = firstNewIndex.current;
    if (index === null) return;
    firstNewIndex.current = null;
    list.current?.querySelectorAll<HTMLButtonElement>('.cm-recent-row')[index]?.focus();
  }, [limit]);

  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions.slice(0, limit)) {
    const group = groups.get(transaction.dateKey);
    if (group) group.push(transaction);
    else groups.set(transaction.dateKey, [transaction]);
  }
  const yesterday = offsetReportDay(today, -1);

  return (
    <section className="panel recent-panel" aria-labelledby="cm-recent-title">
      <header className="cm-recent-head">
        <div>
          <h2 id="cm-recent-title">Giao dịch gần đây</h2>
          <p aria-live="polite">{transactions.length.toLocaleString('vi-VN')} giao dịch</p>
        </div>
        <Link to="/app/transactions" className="cm-recent-all">Xem tất cả <ArrowRight size={15} aria-hidden="true" /></Link>
      </header>

      {filterLabel && (
        <div className="cm-recent-active-filter">
          <span>{filterLabel}</span>
          <button type="button" onClick={onClearFilter}>Bỏ lọc</button>
        </div>
      )}

      {transactions.length ? (
        <>
          <div className="cm-recent-list" ref={list} role="region" aria-label="Danh sách giao dịch gần đây">
            {Array.from(groups, ([date, rows]) => {
              const relativeDay = date === today ? 'Hôm nay' : date === yesterday ? 'Hôm qua' : '';
              return (
                <div className="cm-recent-group" key={date}>
                  <h3 className="cm-recent-date">
                    {relativeDay && <span>{relativeDay}</span>}
                    <time dateTime={date}>{date.split('-').reverse().join('/')}</time>
                  </h3>
                  <ul className="cm-recent-day-rows">
                    {rows.map(row => (
                      <li key={row.id}><RecentRow row={row} onOpen={onOpen} /></li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {limit < transactions.length && (
            <div className="cm-recent-more">
              <span>Đang xem {limit.toLocaleString('vi-VN')}/{transactions.length.toLocaleString('vi-VN')}</span>
              <button type="button" onClick={() => {
                firstNewIndex.current = limit;
                setLimit(limit + pageSize);
              }}>
                Xem thêm giao dịch <ChevronDown size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="cm-recent-empty">
          <span className="cm-recent-icon"><WalletCards size={20} aria-hidden="true" /></span>
          <p>{filterLabel ? 'Không có giao dịch khớp bộ lọc' : 'Chưa có giao dịch nào'}</p>
          <button type="button" onClick={onAdd}><Plus size={15} aria-hidden="true" /> Thêm giao dịch</button>
        </div>
      )}
    </section>
  );
}

function RecentRow({ row, onOpen }: { row: Transaction; onOpen: (transaction: Transaction) => void }) {
  const { Icon, sign } = flowDetails[row.type];
  const title = transactionTitle(row);
  const category = row.type === 'income'
    ? INCOME_CATEGORY_LABELS[row.categoryId] ?? 'Thu nhập'
    : row.type === 'transfer' ? 'Chuyển tiền' : CATEGORY_LABELS[row.categoryId] ?? 'Khác';

  return (
    <button type="button" className="cm-recent-row" data-flow={row.type} onClick={() => onOpen(row)}>
      <span className="cm-recent-icon">
        {row.imageUrl ? <img src={row.imageUrl} alt="" loading="lazy" /> : <Icon size={17} aria-hidden="true" />}
      </span>
      <span className="cm-recent-copy">
        <strong>{title}</strong>
        <span>{category}</span>
      </span>
      <span className="cm-recent-values">
        <strong>{sign}{row.amount.toLocaleString('vi-VN')} <span>₫</span></strong>
        {row.transactionTime && <time dateTime={row.transactionTime}>{row.transactionTime.slice(0, 5)}</time>}
      </span>
    </button>
  );
}
