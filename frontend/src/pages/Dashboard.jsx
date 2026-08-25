import { useState, useEffect, useCallback } from 'react';
import AppHeader from '../components/layout/AppHeader';
import BalanceCard from '../components/dashboard/BalanceCard';
import WalletList from '../components/dashboard/WalletList';
import TransactionForm from '../components/dashboard/TransactionForm';
import ChartSection from '../components/dashboard/ChartSection';
import TransactionHistory from '../components/dashboard/TransactionHistory';
import BudgetSection from '../components/dashboard/BudgetSection';
import RecurringSection from '../components/dashboard/RecurringSection';
import api from '../api/client';

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [wallets, setWallets]   = useState([]);
  const [activeWalletId, setActiveWalletId] = useState(null);
  const [summary, setSummary]   = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const fetchWallets = useCallback(async () => {
    try {
      const { data } = await api.get('/wallets');
      setWallets(data.wallets);
    } catch (err) { console.error(err); }
  }, [refreshKey]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = activeWalletId ? `?walletId=${activeWalletId}` : '';
      const { data } = await api.get(`/transactions/summary${params}`);
      setSummary(data.summary);
    } catch (err) { console.error(err); }
    finally { setSummaryLoading(false); }
  }, [activeWalletId, refreshKey]);

  useEffect(() => { fetchWallets(); }, [refreshKey]);
  useEffect(() => { fetchSummary(); }, [activeWalletId, refreshKey]);

  const handleSuccess = () => refresh();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <AppHeader activeSection={activeSection} setActiveSection={setActiveSection} />

      <main className="max-w-screen-2xl mx-auto px-4 lg:px-6 py-6">
        {/* Always-visible balance cards */}
        <BalanceCard summary={summary} loading={summaryLoading} />

        {/* Dashboard Section */}
        {activeSection === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-up">
            {/* Left column: wallets + form */}
            <div className="lg:col-span-1 space-y-6">
              <WalletList
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSelect={setActiveWalletId}
                onRefresh={refresh}
              />
              <TransactionForm
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSuccess={handleSuccess}
              />
            </div>

            {/* Right column: charts + history */}
            <div className="lg:col-span-2 xl:col-span-3 space-y-6">
              <ChartSection walletId={activeWalletId} refreshKey={refreshKey} />
              <TransactionHistory walletId={activeWalletId} refreshKey={refreshKey} />
            </div>
          </div>
        )}

        {/* Transactions Section */}
        {activeSection === 'transactions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
            <div className="lg:col-span-1 space-y-6">
              <WalletList
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSelect={setActiveWalletId}
                onRefresh={refresh}
              />
              <TransactionForm
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSuccess={handleSuccess}
              />
            </div>
            <div className="lg:col-span-2">
              <TransactionHistory walletId={activeWalletId} refreshKey={refreshKey} />
            </div>
          </div>
        )}

        {/* Budgets Section */}
        {activeSection === 'budgets' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
            <div className="lg:col-span-1">
              <WalletList
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSelect={setActiveWalletId}
                onRefresh={refresh}
              />
            </div>
            <div className="lg:col-span-2">
              <BudgetSection refreshKey={refreshKey} />
            </div>
          </div>
        )}

        {/* Recurring Section */}
        {activeSection === 'recurring' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
            <div className="lg:col-span-1">
              <WalletList
                wallets={wallets}
                activeWalletId={activeWalletId}
                onSelect={setActiveWalletId}
                onRefresh={refresh}
              />
            </div>
            <div className="lg:col-span-2">
              <RecurringSection wallets={wallets} refreshKey={refreshKey} onRefresh={refresh} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
