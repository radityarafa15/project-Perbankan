-- ============================================================
-- SMoney Banking App — Full Database Schema
-- Compatible with SQLite (via better-sqlite3)
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    username    TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL UNIQUE,
    password_hash TEXT  NOT NULL,
    pin_hash    TEXT,   -- nullable, diset setelah login pertama
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- WALLETS (Dompet / Akun Bank)
-- Relasi One-to-Many: satu user bisa punya banyak dompet
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    icon        TEXT    NOT NULL DEFAULT '💼',
    color       TEXT    NOT NULL DEFAULT '#2a78d6',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- TRANSACTIONS (Transaksi: income / expense / transfer)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id       INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    type            TEXT    NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    category        TEXT    NOT NULL,
    amount          INTEGER NOT NULL CHECK (amount > 0),
    description     TEXT    NOT NULL,
    transaction_date TEXT   NOT NULL,
    to_wallet_id    INTEGER,  -- hanya diisi untuk type='transfer'
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (wallet_id)    REFERENCES wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)      REFERENCES users(id)   ON DELETE CASCADE,
    FOREIGN KEY (to_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON transactions(user_id, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet
    ON transactions(wallet_id, transaction_date DESC);

-- ============================================================
-- BUDGETS (Anggaran Bulanan per Kategori)
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    category     TEXT    NOT NULL,
    limit_amount INTEGER NOT NULL CHECK (limit_amount > 0),
    month        TEXT    NOT NULL,  -- format: YYYY-MM
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, category, month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- RECURRING TRANSACTIONS (Transaksi Berulang)
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id    INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    type         TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    category     TEXT    NOT NULL,
    amount       INTEGER NOT NULL CHECK (amount > 0),
    description  TEXT    NOT NULL,
    frequency    TEXT    NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    next_date    TEXT    NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,  -- 1=aktif, 0=nonaktif
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);
