import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { formatRupiah, formatAmountInput, parseAmount, thisMonth, EXPENSE_CATEGORIES } from '../../utils/format';

export default function BudgetSection({ refreshKey }) {
  const { addToast } = useToast();
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [form, setForm]        = useState({ category: '', limit_amount: '', month: thisMonth() });
  const [saving, setSaving]    = useState(false);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/budgets?month=${form.month}`);
      setBudgets(data.budgets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBudgets(); }, [form.month, refreshKey]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/budgets', {
        category: form.category,
        limit_amount: parseAmount(form.limit_amount),
        month: form.month,
      });
      setBudgets(data.budgets);
      addToast('Anggaran berhasil disimpan.', 'success');
      setForm(f => ({ ...f, category: '', limit_amount: '' }));
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menyimpan anggaran.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/budgets/${id}`);
      addToast('Anggaran dihapus.', 'success');
      fetchBudgets();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menghapus.', 'error');
    }
  };

  const statusColor = (status) => {
    if (status === 'critical') return 'var(--color-danger)';
    if (status === 'warning')  return 'var(--color-warning)';
    return 'var(--color-good)';
  };
  const statusBg = (status) => {
    if (status === 'critical') return 'rgba(220,38,38,0.08)';
    if (status === 'warning')  return 'rgba(217,119,6,0.08)';
    return 'rgba(22,163,74,0.08)';
  };

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <h2 className="font-bold text-sm uppercase tracking-widest"
            style={{ color: 'var(--color-text-secondary)' }}>
          Anggaran Bulanan
        </h2>
        <input
          type="month"
          className="field-input"
          style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }}
          value={form.month}
          onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
        />
      </div>

      {/* Form tambah anggaran */}
      <form onSubmit={handleSave} className="flex flex-wrap gap-2 mb-6 p-4 rounded-xl"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <select
          className="field-input"
          style={{ flex: '1 1 160px', padding: '9px 12px', fontSize: '13px' }}
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          required
        >
          <option value="">Pilih Kategori</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '1 1 160px' }}>
          <span className="input-prefix">Rp</span>
          <input
            type="text"
            inputMode="numeric"
            className="field-input field-input-rp"
            style={{ padding: '9px 12px 9px 42px', fontSize: '13px' }}
            placeholder="Batas anggaran"
            value={form.limit_amount}
            onChange={e => setForm(f => ({ ...f, limit_amount: formatAmountInput(e.target.value.replace(/\./g, '')) }))}
            required
          />
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm" style={{ flex: '0 0 auto' }}>
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </form>

      {/* Daftar anggaran */}
      {loading ? (
        <div className="py-10 text-center">
          <div className="inline-block w-7 h-7 rounded-full border-2 animate-spin"
               style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : budgets.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Belum ada anggaran untuk bulan ini.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Isi formulir di atas untuk memulai.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {budgets.map(b => {
            const pct = Math.min(b.percentage, 100);
            const sColor = statusColor(b.status);
            const sBg    = statusBg(b.status);
            return (
              <div key={b.id}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                      {b.category}
                    </span>
                    {b.status !== 'ok' && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: sBg, color: sColor }}>
                        {b.status === 'critical' ? 'Melebihi!' : 'Hampir'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatRupiah(b.spent)} / {formatRupiah(b.limit_amount)}
                    </span>
                    <button
                      onClick={() => handleDelete(b.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px 4px', lineHeight: 1 }}
                      title="Hapus anggaran"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${b.status !== 'ok' ? b.status : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs mt-1.5 tabular-nums" style={{ color: sColor }}>
                  {b.percentage}% terpakai
                  {b.status === 'critical' && b.spent > b.limit_amount
                    ? ` — Melebihi ${formatRupiah(b.spent - b.limit_amount)}`
                    : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
