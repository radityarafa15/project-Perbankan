import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Register() {
  const { register } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      addToast('Konfirmasi password tidak cocok.', 'error'); return;
    }
    if (form.password.length < 8) {
      addToast('Password minimal 8 karakter.', 'error'); return;
    }
    setLoading(true);
    try {
      await register({ name: form.name, username: form.username, email: form.email, password: form.password });
      addToast('Akun berhasil dibuat! Selamat datang 🎉', 'success');
      navigate('/dashboard');
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal mendaftar. Coba lagi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = () => {
    const p = form.password;
    if (!p) return null;
    if (p.length < 8) return { label: 'Lemah', color: 'var(--color-danger)', width: '33%' };
    if (p.length < 12) return { label: 'Sedang', color: 'var(--color-warning)', width: '66%' };
    return { label: 'Kuat', color: 'var(--color-good)', width: '100%' };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-10"
           style={{ background: 'radial-gradient(ellipse, #7c6cf2, transparent)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))', boxShadow: '0 8px 32px rgba(124,108,242,0.35)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12c0 1.1.9 2 2 2h14v-4M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>SMoney</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Mulai kelola keuanganmu</p>
        </div>

        <div className="glass-card p-8">
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--color-text)' }}>Buat Akun Baru</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Nama Lengkap</label>
              <input id="reg-name" type="text" name="name" value={form.name} onChange={handleChange}
                className="field-input" placeholder="Nama Kamu" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Username</label>
                <input id="reg-username" type="text" name="username" value={form.username} onChange={handleChange}
                  className="field-input" placeholder="username" pattern="[a-z0-9_]{4,20}"
                  title="4–20 karakter: huruf kecil, angka, underscore" required />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input id="reg-email" type="email" name="email" value={form.email} onChange={handleChange}
                  className="field-input" placeholder="email@kamu.com" required />
              </div>
            </div>
            <div>
              <label className="field-label">Password</label>
              <div className="relative">
                <input id="reg-password" type={showPwd ? 'text' : 'password'} name="password"
                  value={form.password} onChange={handleChange}
                  className="field-input pr-10" placeholder="Minimal 8 karakter" required />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                  {showPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {strength && (
                <div className="mt-2">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: strength.width, background: strength.color }} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: strength.color }}>Kekuatan: {strength.label}</p>
                </div>
              )}
            </div>
            <div>
              <label className="field-label">Konfirmasi Password</label>
              <input id="reg-confirm" type="password" name="confirm" value={form.confirm} onChange={handleChange}
                className="field-input" placeholder="Ulangi password" required />
              {form.confirm && form.password !== form.confirm && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>Password tidak cocok</p>
              )}
            </div>

            <button id="reg-submit" type="submit" disabled={loading} className="btn btn-primary w-full mt-2" style={{ padding: '13px' }}>
              {loading ? 'Memproses...' : 'Buat Akun'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-secondary)' }}>
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold" style={{ color: 'var(--color-accent)' }}>Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
