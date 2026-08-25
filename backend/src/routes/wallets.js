'use strict';
const express = require('express');
const router = express.Router();
const WalletService = require('../services/WalletService');
const { authenticate } = require('../middleware/auth');

// Semua routes ini memerlukan autentikasi
router.use(authenticate);

// GET /api/wallets
router.get('/', (req, res) => {
  try {
    const wallets = WalletService.getAll(req.user.id);
    res.json({ wallets });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/wallets
router.post('/', (req, res) => {
  try {
    const wallet = WalletService.create(req.user.id, req.body);
    res.status(201).json({ message: 'Dompet berhasil dibuat.', wallet });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/wallets/:id
router.get('/:id', (req, res) => {
  try {
    const wallet = WalletService.getById(req.user.id, Number(req.params.id));
    res.json({ wallet });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/wallets/:id
router.put('/:id', (req, res) => {
  try {
    const wallet = WalletService.update(req.user.id, Number(req.params.id), req.body);
    res.json({ message: 'Dompet berhasil diubah.', wallet });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/wallets/:id
router.delete('/:id', (req, res) => {
  try {
    const result = WalletService.delete(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
