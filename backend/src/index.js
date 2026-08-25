'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getDb, closeDb } = require('./database/connection');
const RecurringService = require('./services/RecurringService');

// Routes
const authRoutes       = require('./routes/auth');
const walletRoutes     = require('./routes/wallets');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes     = require('./routes/budgets');
const recurringRoutes  = require('./routes/recurring');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logging (development only) ───────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/wallets',      walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets',      budgetRoutes);
app.use('/api/recurring',    recurringRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan server.' });
});

// ── Start Server ──────────────────────────────────────────────
function start() {
  // Inisialisasi database (auto-creates tables from schema.sql)
  getDb();

  // Proses transaksi berulang yang jatuh tempo saat startup
  try {
    const result = RecurringService.processDue();
    if (result.processed > 0) {
      console.log(`⏰ ${result.processed} transaksi berulang diproses.`);
    }
  } catch (err) {
    console.error('Gagal memproses transaksi berulang:', err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 SMoney Backend berjalan di http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => { server.close(); closeDb(); });
  process.on('SIGINT',  () => { server.close(); closeDb(); process.exit(0); });
}

start();
