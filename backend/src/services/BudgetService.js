'use strict';
const { getDb } = require('../database/connection');

/**
 * BudgetService — menangani anggaran bulanan per kategori.
 */
class BudgetService {
  /**
   * Mendapatkan semua anggaran bulan tertentu, lengkap dengan total pengeluaran aktual.
   * @param {number} userId
   * @param {string} month - format YYYY-MM (default: bulan ini)
   */
  getAll(userId, month = null) {
    const db = getDb();
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const budgets = db
      .prepare(
        `SELECT b.*,
                COALESCE(SUM(t.amount), 0) AS spent
         FROM budgets b
         LEFT JOIN transactions t
           ON t.user_id = b.user_id
          AND t.category = b.category
          AND t.type = 'expense'
          AND substr(t.transaction_date, 1, 7) = b.month
         WHERE b.user_id = ? AND b.month = ?
         GROUP BY b.id
         ORDER BY b.category ASC`
      )
      .all(userId, targetMonth);

    return budgets.map(b => ({
      ...b,
      percentage: Math.min(Math.round((b.spent / b.limit_amount) * 100), 999),
      status:
        b.spent >= b.limit_amount
          ? 'critical'
          : b.spent >= b.limit_amount * 0.8
          ? 'warning'
          : 'ok',
    }));
  }

  /**
   * Menetapkan anggaran untuk kategori di bulan tertentu.
   * Jika sudah ada, update nilainya (UPSERT).
   * @param {number} userId
   * @param {{ category, limit_amount, month }} data
   */
  upsert(userId, { category, limit_amount, month }) {
    if (!category?.trim())
      throw Object.assign(new Error('Kategori wajib diisi.'), { status: 400 });
    if (!Number.isInteger(limit_amount) || limit_amount <= 0)
      throw Object.assign(new Error('Batas anggaran harus bilangan bulat positif.'), { status: 400 });

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    getDb()
      .prepare(
        `INSERT INTO budgets (user_id, category, limit_amount, month)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, category, month)
         DO UPDATE SET limit_amount = excluded.limit_amount`
      )
      .run(userId, category.trim(), limit_amount, targetMonth);

    return this.getAll(userId, targetMonth);
  }

  /**
   * Menghapus anggaran berdasarkan ID.
   * @param {number} userId
   * @param {number} budgetId
   */
  delete(userId, budgetId) {
    const result = getDb()
      .prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?')
      .run(budgetId, userId);
    if (result.changes === 0)
      throw Object.assign(new Error('Anggaran tidak ditemukan.'), { status: 404 });
    return { message: 'Anggaran berhasil dihapus.' };
  }
}

module.exports = new BudgetService();
