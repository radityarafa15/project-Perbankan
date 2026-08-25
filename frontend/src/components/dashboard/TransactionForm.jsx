import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import {
  today, formatAmountInput, parseAmount,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES
} from '../../utils/format';
import PinModal from '../ui/PinModal';

const TABS = [
  { key: 'income',   label: 'Pemasukan',   color: 'var(--color-good)' },
  { key: 'expense',  label: 'Pengeluaran', color: 'var(--color-danger)' },
  { key: 'transfer', label: 'Transfer',    color: 'var(--color-accent)' },
];

const emptyForm = { category: '', amount: '', description: '', transaction_date: today() };

export default function TransactionForm({ wallets, activeWalletId, onSuccess }) {
  const { addToast } = useToast();
  const [tab, setTab]     = useState('income');
  const [form, setForm]   = useState(emptyForm);
  const [transfer, setTransfer] = useState({ fromWalletId: '', toWalletId: '', amount: '', description: '', transaction_date: today() });
  const [loading, setLoading]   = useState(false);
  const [showPin, setShowPin]   = useState(false);

  useEffect(() => {
    if (activeWalletId) {
      setTransfer(f => ({ ...f, fromWalletId: activeWalletId }));
    }
  }, [activeWalletId]);

  const categories = tab === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleAmountChange = (e, isTransfer = false) => {
    const raw = e.target.value.replace(/\./g, '');
    const formatted = formatAmountInput(raw);
    if (isTransfer) {
      setTransfer(f => ({ ...f, amount: formatted }));
    } else {
      setForm(f => ({ ...f, amount: formatted }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const walletId = activeWalletId || wallets[0]?.id;
      if (!walletId) { addToast('Pilih dompet terlebih dahulu.', 'error'); return; }

      await api.post('/transactions', {
        walletId,
        type: tab,
        category: form.category,
        amount: parseAmount(form.amount),
        description: form.description,
        transaction_date: form.transaction_date,
      });
      addToast(`Transaksi ${tab === 'income' ? 'pemasukan' : 'pengeluaran'} berhasil ditambahkan!`, 'success');
      setForm(emptyForm);
      onSuccess();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menyimpan transaksi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (pin) => {
    setLoading(true);
    try {
      await api.post('/transactions/transfer', {
        fromWalletId: Number(transfer.fromWalletId),
        toWalletId: Number(transfer.toWalletId),
        amount: parseAmount(transfer.amount),
        pin,
        description: transfer.description || 'Transfer',
        transaction_date: transfer.transaction_date,
      });
      addToast('Transfer berhasil!', 'success');
      setTransfer(f => ({ ...f, amount: '', description: '' }));
      setShowPin(false);
      onSuccess();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal melakukan transfer.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const submitTransferRequest = (e) => {
    e.preventDefault();
    if (!transfer.fromWalletId || !transfer.toWalletId) {
      addToast('Pilih dompet asal dan tujuan.', 'error'); return;
    }
    if (Number(transfer.fromWalletId) === Number(transfer.toWalletId)) {
      addToast('Dompet asal dan tujuan tidak boleh sama.', 'error'); return;
    }
    if (!parseAmount(transfer.amount)) {
      addToast('Masukkan nominal transfer.', 'error'); return;
    }
    setShowPin(true);
  };

  const activeTab = TABS.find(t => t.key === tab);

  return (
    <>
      <div className="glass-card p-5">
        <h2 className="font-bold text-sm uppercase tracking-widest mb-4"
            style={{ color: 'var(--color-text-secondary)' }}>
          Tambah Transaksi
        </h2>

        {/* Tab switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl mb-5"
             style={{ background: 'var(--color-surface-2)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              id={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className="py-2 px-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: tab === t.key ? t.color + '20' : 'transparent',
                color: tab === t.key ? t.color : 'var(--color-text-secondary)',
                border: tab === t.key ? `1px solid ${t.color}44` : '1px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Income / Expense form */}
        {tab !== 'transfer' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            {!activeWalletId && wallets.length > 1 && (
              <div>
                <label className="field-label">Dompet</label>
                <select className="field-input"
                  value={form.walletId || ''}
                  onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))}>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="field-label">Kategori</label>
              <select className="field-input" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
                <option value="">Pilih Kategori</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Nominal — fix Rp prefix */}
            <div>
              <label className="field-label">Nominal</label>
              <div style={{ position: 'relative' }}>
                <span className="input-prefix">Rp</span>
                <input
                  id="input-nominal"
                  type="text"
                  inputMode="numeric"
                  className="field-input field-input-rp"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => handleAmountChange(e)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="field-label">Keterangan</label>
              <input type="text" className="field-input" maxLength={100}
                placeholder="Contoh: Gaji Agustus"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
            </div>

            <div>
              <label className="field-label">Tanggal</label>
              <input type="date" className="field-input"
                value={form.transaction_date}
                onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} required />
            </div>

            <button
              id="btn-save-transaction"
              type="submit"
              disabled={loading}
              className="btn w-full font-semibold"
              style={{
                background: `linear-gradient(135deg, ${activeTab?.color}, ${activeTab?.color}cc)`,
                color: '#fff',
                padding: '12px',
                boxShadow: `0 4px 16px ${activeTab?.color}33`,
              }}>
              {loading ? 'Menyimpan...' : `Simpan ${tab === 'income' ? 'Pemasukan' : 'Pengeluaran'}`}
            </button>
          </form>
        ) : (
          /* Transfer form */
          <form onSubmit={submitTransferRequest} className="space-y-3">
            <div>
              <label className="field-label">Dari Dompet</label>
              <select className="field-input"
                value={transfer.fromWalletId}
                onChange={e => setTransfer(f => ({ ...f, fromWalletId: e.target.value }))} required>
                <option value="">Pilih dompet asal</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Ke Dompet</label>
              <select className="field-input"
                value={transfer.toWalletId}
                onChange={e => setTransfer(f => ({ ...f, toWalletId: e.target.value }))} required>
                <option value="">Pilih dompet tujuan</option>
                {wallets.filter(w => w.id !== Number(transfer.fromWalletId)).map(w =>
                  <option key={w.id} value={w.id}>{w.name}</option>
                )}
              </select>
            </div>
            <div>
              <label className="field-label">Nominal Transfer</label>
              <div style={{ position: 'relative' }}>
                <span className="input-prefix">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field-input field-input-rp"
                  placeholder="0"
                  value={transfer.amount}
                  onChange={e => handleAmountChange(e, true)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label">Keterangan (opsional)</label>
              <input type="text" className="field-input" maxLength={100}
                placeholder="Transfer untuk..." value={transfer.description}
                onChange={e => setTransfer(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Tanggal</label>
              <input type="date" className="field-input"
                value={transfer.transaction_date}
                onChange={e => setTransfer(f => ({ ...f, transaction_date: e.target.value }))} required />
            </div>
            <button
              id="btn-transfer"
              type="submit"
              className="btn w-full font-semibold"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))',
                color: '#fff',
                padding: '12px',
                boxShadow: '0 4px 16px rgba(124,108,242,0.35)',
              }}>
              Transfer (Verifikasi PIN)
            </button>
          </form>
        )}
      </div>

      {showPin && (
        <PinModal
          onConfirm={handleTransfer}
          onCancel={() => setShowPin(false)}
          loading={loading}
        />
      )}
    </>
  );
}
