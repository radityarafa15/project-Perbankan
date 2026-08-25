'use strict';
const express = require('express');
const router = express.Router();
const BudgetService = require('../services/BudgetService');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/budgets?month=YYYY-MM
router.get('/', (req, res) => {
  try {
    const budgets = BudgetService.getAll(req.user.id, req.query.month || null);
    res.json({ budgets });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/budgets (upsert)
router.post('/', (req, res) => {
  try {
    const { category, limit_amount, month } = req.body;
    const budgets = BudgetService.upsert(req.user.id, {
      category,
      limit_amount: Number(limit_amount),
      month,
    });
    res.json({ message: 'Anggaran berhasil disimpan.', budgets });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', (req, res) => {
  try {
    const result = BudgetService.delete(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
