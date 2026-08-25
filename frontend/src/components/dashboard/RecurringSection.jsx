import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { formatRupiah, formatAmountInput, parseAmount, today, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../../utils/format';

const FREQ = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
];

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>
);

export default function RecurringSection({ wallets, refreshKey, onRefresh }) {
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    walletId: '', type: 'expense', category: '', amount: '', description: '', frequency: 'monthly', next_date: today()
  });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recurring');
      setItems(data.recurring);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [refreshKey]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/recurring', {
        walletId: Number(form.walletId || wallets[0]?.id),
        type: form.type,
        category: form.category,
        amount: parseAmount(form.amount),
        description: form.description,
        frequency: form.frequency,
        next_date: form.next_date,
      });
      addToast('Transaksi berulang berhasil dibuat!', 'success');
      setForm(f => ({ ...f, category: '', amount: '', description: '' }));
      fetch();
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menyimpan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus transaksi berulang ini?')) return;
    try {
      await api.delete(`/recurring/${id}`);
      addToast('Transaksi berulang dihapus.', 'success');
      fetch();
      if (onRefresh) onRefresh();
    } catch (err) { addToast(err.response?.data?.error || 'Gagal menghapus.', 'error'); }
  };

  const cats = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="glass-card p-6">
      <h2 className="font-bold text-sm uppercase tracking-widest mb-5"
          style={{ color: 'var(--color-text-secondary)' }}>
        Transaksi Berulang
      </h2>

      <form onSubmit={handleCreate} className="space-y-4 mb-6 p-4 rounded-xl"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Jenis</label>
            <select className="field-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, category: '' }))}>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
          </div>
          <div>
            <label className="field-label">Frekuensi</label>
            <select className="field-input" value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
              {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Kategori</label>
            <select className="field-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
              <option value="">Pilih Kategori</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Nominal</label>
            <div style={{ position: 'relative' }}>
              <span className="input-prefix">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                className="field-input field-input-rp"
                placeholder="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: formatAmountInput(e.target.value.replace(/\./g, '')) }))}
                required
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Keterangan</label>
            <input type="text" className="field-input" placeholder="Misal: Langganan Netflix"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          </div>
          <div>
            <label className="field-label">Mulai Tanggal</label>
            <input type="date" className="field-input" value={form.next_date}
              onChange={e => setForm(f => ({ ...f, next_date: e.target.value }))} required />
          </div>
        </div>

        {wallets.length > 1 && (
          <div>
            <label className="field-label">Dompet</label>
            <select className="field-input" value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? 'Menyimpan...' : 'Tambah Transaksi Berulang'}
        </button>
      </form>

      {loading ? (
        <div className="py-10 text-center">
          <div className="inline-block w-7 h-7 rounded-full border-2 animate-spin"
               style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Belum ada transaksi berulang.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Buat jadwal transaksi rutin melalui formulir di atas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3.5 rounded-xl"
                 style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                  {item.description}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.category} &middot; {FREQ.find(f => f.value === item.frequency)?.label} &middot; Berikutnya: {item.next_date}
                </p>
              </div>
              <span className="font-bold text-sm whitespace-nowrap"
                    style={{ color: item.type === 'income' ? 'var(--color-good)' : 'var(--color-danger)' }}>
                {item.type === 'income' ? '+' : '-'} {formatRupiah(item.amount)}
              </span>
              <button
                onClick={() => handleDelete(item.id)}
                className="btn-ghost btn-sm flex items-center justify-center"
                style={{ color: 'var(--color-muted)', padding: '5px', borderRadius: '6px' }}
                title="Hapus"
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
