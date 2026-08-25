'use strict';
const { getDb } = require('../database/connection');

/**
 * RecurringService — menangani transaksi berulang (otomatis).
 */
class RecurringService {
  getAll(userId) {
    return getDb()
      .prepare('SELECT * FROM recurring_transactions WHERE user_id = ? ORDER BY next_date ASC')
      .all(userId);
  }

  create(userId, walletId, { type, category, amount, description, frequency, next_date }) {
    if (!['income', 'expense'].includes(type))
      throw Object.assign(new Error('Jenis transaksi tidak valid.'), { status: 400 });
    if (!['daily', 'weekly', 'monthly'].includes(frequency))
      throw Object.assign(new Error('Frekuensi tidak valid.'), { status: 400 });
    if (!Number.isInteger(amount) || amount <= 0)
      throw Object.assign(new Error('Nominal harus bilangan bulat positif.'), { status: 400 });

    const result = getDb()
      .prepare(
        `INSERT INTO recurring_transactions
          (wallet_id, user_id, type, category, amount, description, frequency, next_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        walletId, userId, type,
        category?.trim(), amount,
        description?.trim(), frequency,
        next_date || new Date().toISOString().slice(0, 10)
      );

    return getDb()
      .prepare('SELECT * FROM recurring_transactions WHERE id = ?')
      .get(result.lastInsertRowid);
  }

  delete(userId, id) {
    const result = getDb()
      .prepare('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?')
      .run(id, userId);
    if (result.changes === 0)
      throw Object.assign(new Error('Transaksi berulang tidak ditemukan.'), { status: 404 });
    return { message: 'Transaksi berulang dihapus.' };
  }

  /**
   * Memproses semua transaksi berulang yang sudah jatuh tempo.
   * Dipanggil saat server start & bisa dijadwalkan.
   */
  processDue() {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const dueItems = db
      .prepare(
        'SELECT * FROM recurring_transactions WHERE next_date <= ? AND active = 1'
      )
      .all(today);

    const TransactionService = require('./TransactionService');
    const processed = [];

    const process = db.transaction(() => {
      for (const item of dueItems) {
        try {
          // Tambah transaksi
          const method = item.type === 'income' ? 'addIncome' : 'addExpense';
          // Untuk expense, lewati cek saldo agar tidak memblokir recurring
          db.prepare(
            `INSERT INTO transactions
              (wallet_id, user_id, type, category, amount, description, transaction_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            item.wallet_id, item.user_id, item.type,
            item.category, item.amount,
            item.description, today
          );

          // Hitung tanggal berikutnya
          const nextDate = this._nextDate(item.next_date, item.frequency);
          db.prepare(
            'UPDATE recurring_transactions SET next_date = ? WHERE id = ?'
          ).run(nextDate, item.id);

          processed.push(item.id);
        } catch (err) {
          console.error(`Gagal proses recurring #${item.id}:`, err.message);
        }
      }
    });

    process();
    return { processed: processed.length };
  }

  _nextDate(dateStr, frequency) {
    const d = new Date(dateStr);
    if (frequency === 'daily')   d.setDate(d.getDate() + 1);
    if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
    if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
}

module.exports = new RecurringService();
