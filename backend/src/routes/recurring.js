'use strict';
const express = require('express');
const router = express.Router();
const RecurringService = require('../services/RecurringService');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/recurring
router.get('/', (req, res) => {
  try {
    const items = RecurringService.getAll(req.user.id);
    res.json({ recurring: items });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/recurring
router.post('/', (req, res) => {
  try {
    const { walletId, type, category, amount, description, frequency, next_date } = req.body;
    if (!walletId) return res.status(400).json({ error: 'walletId wajib diisi.' });

    const item = RecurringService.create(req.user.id, Number(walletId), {
      type, category, amount: Number(amount), description, frequency, next_date,
    });
    res.status(201).json({ message: 'Transaksi berulang berhasil dibuat.', recurring: item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/recurring/:id
router.delete('/:id', (req, res) => {
  try {
    const result = RecurringService.delete(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
