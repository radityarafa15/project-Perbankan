import { useState } from 'react';
import { formatRupiah } from '../../utils/format';
import api from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

// SVG Icons
const IconWallet = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const WALLET_COLORS = ['#7c6cf2', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6'];

export default function WalletList({ wallets, activeWalletId, onSelect, onRefresh }) {
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#7c6cf2' });
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/wallets', { name: form.name, color: form.color });
      addToast('Dompet berhasil dibuat!', 'success');
      setForm({ name: '', color: '#7c6cf2' });
      setShowForm(false);
      onRefresh();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal membuat dompet.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Hapus dompet "${name}"? Semua transaksinya juga akan dihapus.`)) return;
    try {
      await api.delete(`/wallets/${id}`);
      addToast('Dompet dihapus.', 'success');
      onRefresh();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menghapus.', 'error');
    }
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
          Dompet / Akun
        </h2>
        <button
          id="btn-add-wallet"
          onClick={() => setShowForm(v => !v)}
          className="btn btn-secondary btn-sm flex items-center gap-1"
        >
          <IconPlus />
          {showForm ? 'Batal' : 'Tambah'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-4 rounded-xl space-y-3"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
          <div>
            <label className="field-label">Nama Dompet</label>
            <input className="field-input" placeholder="Contoh: BCA, GoPay..." required
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Warna</label>
            <div className="flex gap-2 mt-1">
              {WALLET_COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%', background: c,
                    outline: form.color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: '2px', border: '2px solid rgba(128,128,128,0.15)', cursor: 'pointer',
                  }} />
              ))}
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full">
            {loading ? 'Menyimpan...' : 'Buat Dompet'}
          </button>
        </form>
      )}

      <div className="space-y-1">
        {/* Semua Dompet */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left nav-item ${!activeWalletId ? 'active' : ''}`}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(128,128,128,0.12)', color: 'var(--color-text-secondary)' }}>
            <IconGlobe />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Semua Dompet</p>
          </div>
        </button>

        {wallets.map(w => (
          <div key={w.id}
               className={`flex items-center gap-2 p-3 rounded-xl transition-all nav-item ${activeWalletId === w.id ? 'active' : ''}`}>
            <button onClick={() => onSelect(w.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
              {/* Kotak warna menggantikan emoji ikon */}
              <div className="w-8 h-8 rounded-lg flex-shrink-0"
                   style={{ background: `${w.color}30`, borderLeft: `3px solid ${w.color}` }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{w.name}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatRupiah(w.balance)}
                </p>
              </div>
            </button>
            {wallets.length > 1 && (
              <button onClick={() => handleDelete(w.id, w.name)}
                className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 btn-ghost"
                style={{ color: 'var(--color-muted)' }}
                title="Hapus dompet">
                <IconTrash />
              </button>
            )}
          </div>
        ))}

        {wallets.length === 0 && (
          <p className="text-center text-sm py-4" style={{ color: 'var(--color-muted)' }}>Belum ada dompet.</p>
        )}
      </div>
    </div>
  );
}
