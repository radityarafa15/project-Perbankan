/** Format angka ke Rupiah: Rp 1.000.000 */
export function formatRupiah(value) {
  const num = Number(value) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

/** Format tanggal ke "25 Agt 2026" */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format "YYYY-MM" ke "Agustus 2026" */
export function formatMonth(monthStr) {
  if (!monthStr) return '-';
  const [year, month] = monthStr.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/** Parse input nominal (e.g. "1.000.000" → 1000000) */
export function parseAmount(str) {
  return parseInt(String(str).replace(/\D/g, ''), 10) || 0;
}

/** Format input nominal dengan titik pemisah ribuan */
export function formatAmountInput(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Mendapatkan YYYY-MM-DD hari ini */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Mendapatkan YYYY-MM bulan ini */
export function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Warna berdasarkan tipe transaksi */
export function typeColor(type) {
  if (type === 'income')   return 'var(--color-good)';
  if (type === 'expense')  return 'var(--color-danger)';
  if (type === 'transfer') return 'var(--color-accent)';
  return 'var(--color-text)';
}

/** Label Indonesia untuk tipe transaksi */
export function typeLabel(type) {
  const map = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };
  return map[type] || type;
}

/** Kategori pemasukan bawaan */
export const INCOME_CATEGORIES = [
  'Gaji', 'Bonus', 'Investasi', 'Freelance', 'Bisnis', 'Hadiah', 'Lainnya',
];

/** Kategori pengeluaran bawaan */
export const EXPENSE_CATEGORIES = [
  'Makanan', 'Transport', 'Belanja', 'Kesehatan', 'Pendidikan',
  'Hiburan', 'Tagihan', 'Cicilan', 'Investasi', 'Sosial', 'Lainnya',
];
