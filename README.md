# SMoney — Personal Finance Management

Aplikasi manajemen keuangan pribadi modern, aman, dan responsif.

## Tech Stack

- **Backend**: Node.js, Express, SQLite (`better-sqlite3`), JWT, bcryptjs
- **Frontend**: React 18, Vite, Tailwind CSS, Chart.js, jsPDF

## Struktur Proyek

```
project-Perbankan/
├── backend/          # REST API & Database SQLite
│   ├── data/         # File database SQLite (smoney.db)
│   ├── src/          # Service layer OOP, routes, middleware
│   └── package.json
└── frontend/         # React SPA (Vite + Tailwind)
    ├── src/          # Komponen, halaman, konteks auth
    └── package.json
```

## Cara Menjalankan

### 1. Backend Server
```bash
cd backend
npm install
node src/index.js
# Berjalan di http://localhost:3000
```

### 2. Frontend Client
```bash
cd frontend
npm install
npm run dev
# Berjalan di http://localhost:5173
```
