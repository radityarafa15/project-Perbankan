'use strict';
const express = require('express');
const router = express.Router();
const TransactionService = require('../services/TransactionService');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/transactions — riwayat dengan filter + paginasi
router.get('/', (req, res) => {
  try {
    const {
      walletId, type, category, dateFrom, dateTo,
      search, page, limit, sortBy, sortDir
    } = req.query;

    const result = TransactionService.getHistory(req.user.id, {
      walletId: walletId ? Number(walletId) : null,
      type, category, dateFrom, dateTo, search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      sortBy, sortDir,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/transactions/summary — ringkasan keuangan
router.get('/summary', (req, res) => {
  try {
    const walletId = req.query.walletId ? Number(req.query.walletId) : null;
    const summary = TransactionService.getSummary(req.user.id, walletId);
    res.json({ summary });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/transactions/chart — data grafik bulanan & per kategori
router.get('/chart', (req, res) => {
  try {
    const walletId = req.query.walletId ? Number(req.query.walletId) : null;
    const chart = TransactionService.getChartData(req.user.id, walletId);
    res.json({ chart });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/transactions — tambah transaksi income/expense
router.post('/', (req, res) => {
  try {
    const { walletId, type, category, amount, description, transaction_date } = req.body;
    if (!walletId) return res.status(400).json({ error: 'walletId wajib diisi.' });
    if (!['income', 'expense'].includes(type))
      return res.status(400).json({ error: 'Jenis transaksi harus income atau expense.' });

    let tx;
    const data = { category, amount: Number(amount), description, transaction_date };

    if (type === 'income') {
      tx = TransactionService.addIncome(req.user.id, Number(walletId), data);
    } else {
      tx = TransactionService.addExpense(req.user.id, Number(walletId), data);
    }

    res.status(201).json({ message: 'Transaksi berhasil ditambahkan.', transaction: tx });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/transactions/transfer — transfer antar dompet (butuh PIN)
router.post('/transfer', (req, res) => {
  try {
    const { fromWalletId, toWalletId, amount, pin, description, transaction_date } = req.body;

    if (!fromWalletId || !toWalletId || !amount || !pin) {
      return res.status(400).json({
        error: 'fromWalletId, toWalletId, amount, dan pin wajib diisi.'
      });
    }

    const tx = TransactionService.transfer(req.user.id, {
      fromWalletId: Number(fromWalletId),
      toWalletId: Number(toWalletId),
      amount: Number(amount),
      pin: String(pin),
      description,
      transaction_date,
    });

    res.status(201).json({ message: 'Transfer berhasil.', transaction: tx });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  try {
    const result = TransactionService.delete(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
