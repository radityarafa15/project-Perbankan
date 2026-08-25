import { useState, useRef } from 'react';

export default function PinModal({ onConfirm, onCancel, loading }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin || pin.length < 4) { setError('PIN minimal 4 digit.'); return; }
    setError('');
    try {
      await onConfirm(pin);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'PIN salah atau tidak sesuai.';
      setError(msg);
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box max-w-sm text-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: 'rgba(124,108,242,0.12)', color: 'var(--color-accent)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Verifikasi PIN</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Masukkan PIN Anda untuk mengkonfirmasi transfer ini.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <input
              ref={inputRef}
              id="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              className="field-input text-center text-xl font-bold"
              style={{ letterSpacing: '0.4em' }}
              placeholder="• • • •"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {error && (
            <p className="text-sm mb-3" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={onCancel}
              className="btn btn-secondary flex-1" disabled={loading}>
              Batal
            </button>
            <button id="btn-confirm-pin" type="submit"
              disabled={loading || !pin}
              className="btn btn-primary flex-1">
              {loading ? 'Memproses...' : 'Konfirmasi'}
            </button>
          </div>
        </form>

        <p className="text-xs mt-4" style={{ color: 'var(--color-muted)' }}>
          Belum set PIN? Pergi ke Pengaturan (tombol PIN di header) untuk mengaturnya.
        </p>
      </div>
    </div>
  );
}
