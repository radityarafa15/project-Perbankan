'use strict';
const { getDb } = require('../database/connection');
const AuthService = require('./AuthService');
const WalletService = require('./WalletService');

/**
 * TransactionService — core business logic untuk transaksi keuangan.
 *
 * Prinsip OOP yang digunakan:
 * - Enkapsulasi: detail kalkulasi saldo di dalam service, bukan di route
 * - Single Responsibility: setiap method punya satu tugas
 * - Transaction Safety: transfer menggunakan DB transaction (ACID)
 */
class TransactionService {
  /**
   * Menambah transaksi pemasukan (income).
   * @param {number} userId
   * @param {number} walletId
   * @param {{ category, amount, description, transaction_date }} data
   */
  addIncome(userId, walletId, data) {
    this._validateOwnership(userId, walletId);
    return this._insert(userId, walletId, 'income', data);
  }

  /**
   * Menambah transaksi pengeluaran (expense).
   * @param {number} userId
   * @param {number} walletId
   * @param {{ category, amount, description, transaction_date }} data
   */
  addExpense(userId, walletId, data) {
    this._validateOwnership(userId, walletId);

    // Cek saldo mencukupi
    const balance = WalletService._calculateBalance(walletId);
    if (balance < data.amount) {
      throw Object.assign(
        new Error(`Saldo tidak cukup. Saldo tersedia: Rp ${balance.toLocaleString('id-ID')}`),
        { status: 400 }
      );
    }

    return this._insert(userId, walletId, 'expense', data);
  }

  /**
   * Transfer antar dompet (wajib PIN).
   * Menggunakan SQLite transaction untuk ACID safety.
   *
   * @param {number} userId
   * @param {{ fromWalletId, toWalletId, amount, pin, description, transaction_date }} data
   */
  transfer(userId, { fromWalletId, toWalletId, amount, pin, description, transaction_date }) {
    const db = getDb();

    // 1. Verifikasi PIN
    AuthService.verifyPin(userId, pin);

    // 2. Validasi kepemilikan kedua dompet
    this._validateOwnership(userId, fromWalletId);
    this._validateOwnership(userId, toWalletId);

    if (fromWalletId === toWalletId) {
      throw Object.assign(
        new Error('Dompet asal dan tujuan tidak boleh sama.'),
        { status: 400 }
      );
    }

    // 3. Cek saldo cukup
    const balance = WalletService._calculateBalance(fromWalletId);
    if (balance < amount) {
      throw Object.assign(
        new Error(`Saldo tidak cukup. Saldo tersedia: Rp ${balance.toLocaleString('id-ID')}`),
        { status: 400 }
      );
    }

    // 4. Simpan transaksi dalam satu DB transaction (ACID)
    const insertTransfer = db.prepare(
      `INSERT INTO transactions
        (wallet_id, user_id, type, category, amount, description, transaction_date, to_wallet_id)
       VALUES (?, ?, 'transfer', 'Transfer', ?, ?, ?, ?)`
    );

    const doTransfer = db.transaction(() => {
      const result = insertTransfer.run(
        fromWalletId,
        userId,
        amount,
        description || `Transfer ke dompet`,
        transaction_date || new Date().toISOString().slice(0, 10),
        toWalletId
      );
      return result.lastInsertRowid;
    });

    const txId = doTransfer();
    return this.getById(userId, txId);
  }

  /**
   * Mendapatkan riwayat transaksi dengan filter dan paginasi.
   * @param {number} userId
   * @param {{ walletId, type, category, dateFrom, dateTo, search, page, limit, sortBy, sortDir }} filters
   */
  getHistory(userId, filters = {}) {
    const db = getDb();
    const {
      walletId,
      type,
      category,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
      sortBy = 'transaction_date',
      sortDir = 'DESC',
    } = filters;

    const allowedSortBy = ['transaction_date', 'amount', 'category', 'created_at'];
    const allowedSortDir = ['ASC', 'DESC'];
    const safeSort = allowedSortBy.includes(sortBy) ? sortBy : 'transaction_date';
    const safeSortDir = allowedSortDir.includes(sortDir.toUpperCase()) ? sortDir.toUpperCase() : 'DESC';

    let conditions = ['t.user_id = ?'];
    let params = [userId];

    if (walletId) { conditions.push('t.wallet_id = ?'); params.push(walletId); }
    if (type)     { conditions.push('t.type = ?'); params.push(type); }
    if (category) { conditions.push('t.category = ?'); params.push(category); }
    if (dateFrom) { conditions.push('t.transaction_date >= ?'); params.push(dateFrom); }
    if (dateTo)   { conditions.push('t.transaction_date <= ?'); params.push(dateTo); }
    if (search) {
      conditions.push('(t.description LIKE ? OR t.category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.join(' AND ');
    const offset = (Number(page) - 1) * Number(limit);

    const total = db
      .prepare(`SELECT COUNT(*) as c FROM transactions t WHERE ${where}`)
      .get(...params).c;

    const rows = db
      .prepare(
        `SELECT t.*,
                w.name  AS wallet_name,
                w.icon  AS wallet_icon,
                w.color AS wallet_color,
                tw.name AS to_wallet_name
         FROM transactions t
         JOIN wallets w ON w.id = t.wallet_id
         LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
         WHERE ${where}
         ORDER BY t.${safeSort} ${safeSortDir}, t.id ${safeSortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...params, Number(limit), offset);

    return {
      data: rows,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }

  /**
   * Mendapatkan ringkasan (saldo, pemasukan, pengeluaran) per user atau per dompet.
   * @param {number} userId
   * @param {number|null} walletId - opsional, filter per dompet
   */
  getSummary(userId, walletId = null) {
    const db = getDb();
    const params = walletId ? [userId, walletId] : [userId];
    const walletFilter = walletId ? ' AND wallet_id = ?' : '';

    const row = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN type='transfer' THEN amount ELSE 0 END), 0) AS transfer_out
         FROM transactions
         WHERE user_id = ?${walletFilter}`
      )
      .get(...params);

    return {
      income: row.income,
      expense: row.expense,
      balance: row.income - row.expense,
    };
  }

  /**
   * Mendapatkan data grafik bulanan (12 bulan terakhir).
   * @param {number} userId
   * @param {number|null} walletId
   */
  getChartData(userId, walletId = null) {
    const db = getDb();
    const params = walletId ? [userId, walletId] : [userId];
    const walletFilter = walletId ? ' AND wallet_id = ?' : '';

    const monthly = db
      .prepare(
        `SELECT substr(transaction_date, 1, 7) AS month,
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
         FROM transactions
         WHERE user_id = ?${walletFilter}
         GROUP BY substr(transaction_date, 1, 7)
         ORDER BY month ASC
         LIMIT 12`
      )
      .all(...params);

    const byCategory = db
      .prepare(
        `SELECT category, SUM(amount) AS total
         FROM transactions
         WHERE user_id = ?${walletFilter} AND type = 'expense'
         GROUP BY category
         ORDER BY total DESC
         LIMIT 8`
      )
      .all(...params);

    return { monthly, byCategory };
  }

  /**
   * Mendapatkan satu transaksi (validasi kepemilikan via user_id).
   */
  getById(userId, txId) {
    const tx = getDb()
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(txId, userId);
    if (!tx) throw Object.assign(new Error('Transaksi tidak ditemukan.'), { status: 404 });
    return tx;
  }

  /**
   * Menghapus transaksi (validasi kepemilikan).
   */
  delete(userId, txId) {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
      .run(txId, userId);
    if (result.changes === 0) {
      throw Object.assign(new Error('Transaksi tidak ditemukan.'), { status: 404 });
    }
    return { message: 'Transaksi berhasil dihapus.' };
  }

  // ── Private helpers ────────────────────────────────────────

  _insert(userId, walletId, type, { category, amount, description, transaction_date }) {
    if (!category?.trim()) throw Object.assign(new Error('Kategori wajib diisi.'), { status: 400 });
    if (!Number.isInteger(amount) || amount <= 0)
      throw Object.assign(new Error('Nominal harus bilangan bulat positif.'), { status: 400 });
    if (!description?.trim()) throw Object.assign(new Error('Keterangan wajib diisi.'), { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction_date))
      throw Object.assign(new Error('Format tanggal tidak valid (YYYY-MM-DD).'), { status: 400 });

    const result = getDb()
      .prepare(
        `INSERT INTO transactions (wallet_id, user_id, type, category, amount, description, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(walletId, userId, type, category.trim(), amount, description.trim(), transaction_date);

    return this.getById(userId, result.lastInsertRowid);
  }

  _validateOwnership(userId, walletId) {
    const wallet = getDb()
      .prepare('SELECT id FROM wallets WHERE id = ? AND user_id = ?')
      .get(walletId, userId);
    if (!wallet) {
      throw Object.assign(new Error('Dompet tidak ditemukan atau bukan milik Anda.'), { status: 403 });
    }
  }
}

module.exports = new TransactionService();
