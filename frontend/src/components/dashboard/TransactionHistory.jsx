import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { formatRupiah, formatDate, typeLabel } from '../../utils/format';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE_SIZE = 15;

// SVG icons
const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>
);
const IconSort = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
);

export default function TransactionHistory({ walletId, refreshKey }) {
  const { addToast } = useToast();
  const [data, setData]   = useState({ data: [], total: 0, totalPages: 1 });
  const [page, setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortDir, setSortDir] = useState('DESC');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page, limit: PAGE_SIZE, sortDir,
        ...(walletId && { walletId }),
        ...(search && { search }),
        ...(typeFilter && { type: typeFilter }),
      });
      const { data: res } = await api.get(`/transactions?${params}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [walletId, page, search, typeFilter, sortDir, refreshKey]);

  useEffect(() => { setPage(1); }, [walletId, search, typeFilter]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
      await api.delete(`/transactions/${id}`);
      addToast('Transaksi dihapus.', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Gagal menghapus.', 'error');
    }
  };

  const exportCSV = () => {
    const rows = [['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal', 'Dompet']];
    data.data.forEach(t => {
      rows.push([t.transaction_date, typeLabel(t.type), t.category, t.description, t.amount, t.wallet_name]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'transaksi.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Riwayat Transaksi — SMoney', 14, 18);
    doc.setFontSize(10); doc.setTextColor(150);
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal']],
      body: data.data.map(t => [t.transaction_date, typeLabel(t.type), t.category, t.description, formatRupiah(t.amount)]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [98, 84, 212] },
      alternateRowStyles: { fillColor: [248, 248, 252] },
    });
    doc.save('transaksi.pdf');
  };

  const badgeClass = (type) => {
    if (type === 'income') return 'badge-income';
    if (type === 'expense') return 'badge-expense';
    return 'badge-transfer';
  };

  const amountColor = (type) => {
    if (type === 'income') return 'var(--color-good)';
    if (type === 'expense') return 'var(--color-danger)';
    return 'var(--color-accent)';
  };

  const amountPrefix = (type) => type === 'income' ? '+' : type === 'expense' ? '-' : '';

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="font-bold text-sm uppercase tracking-widest flex-1"
            style={{ color: 'var(--color-text-secondary)' }}>
          Riwayat Transaksi
          {data.total > 0 && (
            <span className="ml-2 normal-case font-normal text-xs" style={{ color: 'var(--color-muted)' }}>
              ({data.total})
            </span>
          )}
        </h2>
        <button id="btn-export-csv" onClick={exportCSV}
          className="btn btn-secondary btn-sm flex items-center gap-1.5">
          <IconDownload /> CSV
        </button>
        <button id="btn-export-pdf" onClick={exportPDF}
          className="btn btn-secondary btn-sm flex items-center gap-1.5">
          <IconDownload /> PDF
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          id="search-transaction"
          type="search"
          className="field-input"
          style={{ flex: '1 1 160px', padding: '8px 12px', fontSize: '13px' }}
          placeholder="Cari transaksi..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="field-input"
          style={{ flex: '0 0 auto', width: 'auto', padding: '8px 12px', fontSize: '13px' }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">Semua Jenis</option>
          <option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option>
          <option value="transfer">Transfer</option>
        </select>
        <button
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
          onClick={() => setSortDir(d => d === 'DESC' ? 'ASC' : 'DESC')}
          title="Urutan tanggal"
        >
          <IconSort />
          {sortDir === 'DESC' ? 'Terbaru' : 'Terlama'}
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : data.data.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                   style={{ color: 'var(--color-muted)', margin: '0 auto', opacity: 0.4 }}>
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: '13px' }}>
              {search || typeFilter ? 'Tidak ada hasil yang cocok.' : 'Belum ada transaksi.'}
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jenis</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th>Dompet</th>
                <th style={{ textAlign: 'right' }}>Nominal</th>
                <th style={{ width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(tx => (
                <tr key={tx.id}>
                  <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', fontSize: '12.5px' }}>
                    {formatDate(tx.transaction_date)}
                  </td>
                  <td>
                    <span className={`badge ${badgeClass(tx.type)}`}>{typeLabel(tx.type)}</span>
                  </td>
                  <td style={{ fontSize: '13px' }}>{tx.category}</td>
                  <td style={{ fontSize: '13px', maxWidth: '180px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {tx.wallet_name}
                    {tx.to_wallet_name && <span> → {tx.to_wallet_name}</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '600', color: amountColor(tx.type), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '13px' }}>
                    {amountPrefix(tx.type)} {formatRupiah(tx.amount)}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="btn-ghost btn-sm flex items-center justify-center"
                      style={{ color: 'var(--color-muted)', padding: '5px', borderRadius: '6px' }}
                      title="Hapus"
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4"
             style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Halaman {page} dari {data.totalPages}
          </span>
          <div className="flex gap-2">
            <button id="btn-prev-page" className="btn btn-secondary btn-sm"
              disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Sebelumnya
            </button>
            <button id="btn-next-page" className="btn btn-secondary btn-sm"
              disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
