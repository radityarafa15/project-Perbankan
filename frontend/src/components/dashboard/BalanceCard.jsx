import { formatRupiah } from '../../utils/format';

const cards = [
  {
    key: 'balance',
    label: 'Total Saldo',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    ),
    className: 'stat-accent-balance',
    iconColor: 'var(--color-accent)',
    valueStyle: { color: 'var(--color-text)' },
  },
  {
    key: 'income',
    label: 'Total Pemasukan',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
      </svg>
    ),
    className: 'stat-accent-income',
    iconColor: 'var(--color-good)',
    valueStyle: { color: 'var(--color-good)' },
  },
  {
    key: 'expense',
    label: 'Total Pengeluaran',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
      </svg>
    ),
    className: 'stat-accent-expense',
    iconColor: 'var(--color-danger)',
    valueStyle: { color: 'var(--color-danger)' },
  },
];

export default function BalanceCard({ summary, loading }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.key} className={`glass-card glass-card-hover p-5 ${c.className}`}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${c.iconColor}20`, color: c.iconColor }}
            >
              {c.icon}
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {c.label}
            </span>
          </div>
          {loading ? (
            <div
              className="h-7 w-32 rounded-lg"
              style={{
                background: 'linear-gradient(90deg, rgba(128,128,128,0.08) 25%, rgba(128,128,128,0.18) 50%, rgba(128,128,128,0.08) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
              }}
            />
          ) : (
            <p className="text-2xl font-bold tracking-tight" style={c.valueStyle}>
              {formatRupiah(summary?.[c.key] ?? 0)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
