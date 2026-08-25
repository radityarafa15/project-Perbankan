import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../api/client';

// SVG Icons
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IconKey = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);
const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const NAV = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'transactions', label: 'Transaksi' },
  { key: 'budgets',      label: 'Anggaran' },
  { key: 'recurring',   label: 'Berulang' },
];

export default function AppHeader({ activeSection, setActiveSection }) {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  });

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('smoney_theme', next ? 'dark' : 'light');
  };

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('smoney_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setIsDark(saved === 'dark');
  }, []);

  const handleLogout = () => {
    logout();
    addToast('Kamu berhasil keluar.', 'success');
  };

  const handleSetPin = async (e) => {
    e.preventDefault();
    setSavingPin(true);
    try {
      await api.post('/auth/pin', { pin });
      addToast('PIN berhasil disimpan!', 'success');
      setShowPinSetup(false);
      setPin('');
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menyimpan PIN.', 'error');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <>
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 100,
        transition: 'background 0.25s, border-color 0.25s',
      }}>
        <div className="flex items-center justify-between px-4 lg:px-6 h-14 max-w-screen-2xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12c0 1.1.9 2 2 2h14v-4M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>
              </svg>
            </div>
            <span className="font-bold text-sm hidden sm:block" style={{ color: 'var(--color-text)' }}>SMoney</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(n => (
              <button
                key={n.key}
                id={`nav-${n.key}`}
                onClick={() => setActiveSection(n.key)}
                className={`nav-item ${activeSection === n.key ? 'active' : ''}`}
                style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px' }}
              >
                {n.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <span className="text-sm hidden lg:block" style={{ color: 'var(--color-text-secondary)' }}>
              {user?.name}
            </span>

            {/* Theme toggle */}
            <button
              id="btn-toggle-theme"
              onClick={toggleTheme}
              className="btn btn-secondary btn-sm flex items-center justify-center"
              style={{ width: '34px', height: '34px', padding: 0 }}
              title={isDark ? 'Mode Terang' : 'Mode Gelap'}
            >
              {isDark ? <IconSun /> : <IconMoon />}
            </button>

            <button
              onClick={() => setShowPinSetup(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              title="Set PIN Transfer"
            >
              <IconKey /> PIN
            </button>
            <button
              id="btn-logout"
              onClick={handleLogout}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
            >
              <IconLogout /> Keluar
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden overflow-x-auto px-4 pb-2 gap-1 border-t"
             style={{ borderColor: 'var(--color-border)' }}>
          {NAV.map(n => (
            <button
              key={n.key}
              onClick={() => setActiveSection(n.key)}
              className={`nav-item flex-shrink-0 ${activeSection === n.key ? 'active' : ''}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {n.label}
            </button>
          ))}
        </div>
      </header>

      {/* PIN Setup Modal */}
      {showPinSetup && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPinSetup(false); }}>
          <div className="modal-box max-w-sm text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'rgba(124,108,242,0.12)', color: 'var(--color-accent)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>Set PIN Transfer</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              PIN digunakan untuk mengkonfirmasi transfer antar dompet. Minimal 4 digit angka.
            </p>
            <form onSubmit={handleSetPin} className="space-y-3">
              <input
                type="password" inputMode="numeric" maxLength={8} autoFocus
                className="field-input text-center text-xl tracking-[0.4em]"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                required minLength={4}
              />
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setShowPinSetup(false)} className="btn btn-secondary flex-1">Batal</button>
                <button type="submit" disabled={savingPin} className="btn btn-primary flex-1">
                  {savingPin ? 'Menyimpan...' : 'Simpan PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
