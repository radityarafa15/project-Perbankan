import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import api from '../../api/client';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const CATEGORY_COLORS = [
  '#7c6cf2','#22c55e','#ef4444','#f59e0b','#3b82f6',
  '#ec4899','#14b8a6','#a78bfa','#fb923c','#84cc16',
];

const formatShort = (v) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
};

export default function ChartSection({ walletId, refreshKey }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('monthly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = walletId ? `?walletId=${walletId}` : '';
    setLoading(true);
    api.get(`/transactions/chart${params}`)
      .then(r => setData(r.data.chart))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [walletId, refreshKey]);

  const tooltipStyle = {
    backgroundColor: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    borderWidth: 1,
    titleColor: 'var(--color-text-secondary)',
    bodyColor: 'var(--color-text)',
    padding: 10,
    callbacks: {
      label: (ctx) => ` Rp ${Number(ctx.parsed?.y ?? ctx.parsed).toLocaleString('id-ID')}`,
    },
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: 'var(--color-text-secondary)', font: { size: 12 }, boxWidth: 12, padding: 16 } },
      tooltip: tooltipStyle,
    },
    scales: {
      x: { ticks: { color: 'var(--color-muted)', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: 'var(--color-muted)', font: { size: 11 }, callback: formatShort }, grid: { color: 'var(--color-border)' } },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: 'var(--color-text-secondary)', font: { size: 12 }, padding: 14, boxWidth: 12 },
      },
      tooltip: tooltipStyle,
    },
  };

  const monthlyChartData = data && data.monthly.length > 0 ? {
    labels: data.monthly.map(m => {
      const [y, mo] = m.month.split('-');
      return new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Pemasukan',
        data: data.monthly.map(m => m.income),
        backgroundColor: 'rgba(34,197,94,0.75)',
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: 'Pengeluaran',
        data: data.monthly.map(m => m.expense),
        backgroundColor: 'rgba(239,68,68,0.75)',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  } : null;

  const categoryChartData = data && data.byCategory.length > 0 ? {
    labels: data.byCategory.map(c => c.category),
    datasets: [{
      data: data.byCategory.map(c => c.total),
      backgroundColor: CATEGORY_COLORS,
      borderWidth: 0,
      hoverOffset: 6,
    }],
  } : null;

  const EmptyState = ({ text }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
           style={{ color: 'var(--color-muted)', opacity: 0.35 }}>
        <rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 13l3 3 7-7"/>
      </svg>
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>{text}</p>
    </div>
  );

  return (
    <div className="glass-card p-5">
      <div className="chart-tab-bar">
        <button className={`chart-tab ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}>
          Tren Bulanan
        </button>
        <button className={`chart-tab ${activeTab === 'category' ? 'active' : ''}`}
          onClick={() => setActiveTab('category')}>
          Per Kategori
        </button>
      </div>

      <div style={{ height: '250px', position: 'relative' }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : activeTab === 'monthly' ? (
          monthlyChartData ? <Bar data={monthlyChartData} options={chartOptions} />
            : <EmptyState text="Belum ada data transaksi." />
        ) : (
          categoryChartData ? <Doughnut data={categoryChartData} options={doughnutOptions} />
            : <EmptyState text="Belum ada pengeluaran per kategori." />
        )}
      </div>
    </div>
  );
}
