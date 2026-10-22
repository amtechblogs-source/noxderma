# Noxderma — Enterprise Offline-First Pharmaceutical ERP & CRM

An offline-first business management application designed for pharmaceutical distribution, wholesale pharmacy management, and field medical representative operations.

Developed with **Google Antigravity** using **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Dexie.js (IndexedDB)**, and **Google Cloud Firestore**.

---

## 🌟 Architectural Highlights

1. **True Offline Invoicing & Operations**:
   - Field sales representatives and pharmacy counters can create and print invoices completely offline.
   - Transactions survive browser reloads and power interruptions via **Dexie.js (IndexedDB)**.
   - All mutations are recorded in a durable, dependency-ordered **Outbox Queue**.
2. **Collision-Safe Offline Numbering**:
   - Disconnected devices generate unique provisional identifiers: `OFF-{DEVICE_ID}-{YYMMDD}-{SEQUENCE}`.
   - Upon reconnection, the central system assigns an authoritative fiscal sequence (`NXD-YYYY-XXXXX`) while preserving the provisional reference in the audit trail.
3. **Strict FEFO Batch Inventory (First Expiry, First Out)**:
   - Automated allocation to earliest-expiring active batches.
   - Strict expiry blocking prevents the sale of expired or quarantined formulations.
   - Granular separation of Damaged Inventory and Clinical Sample issues from commercial sales.
4. **Three Distinct Types of Credit**:
   - **Manufacturer Payables**: Amounts owed to pharmaceutical manufacturers.
   - **Distributor Receivables**: Wholesale credit extended to regional distribution networks.
   - **Direct Pharmacy Receivables**: Outstanding balances owed by medical stores and clinics.
   - 30-Day Credit Aging with automatic Day-31 WhatsApp reminder queue.
5. **Auditable Profit & Loss (P&L)**:
   - Historical COGS uses actual landed batch cost at the moment of sale.
   - Does not rewrite historical margins when newer purchases have different costs.
   - Samples and damaged stock are accounted for as separate operating write-offs, not sales revenue.
6. **External Image Storage (ImageKit.io)**:
   - Product photographs and marketing graphics are stored externally in ImageKit.
   - Uploads use server-signed authentication tokens generated via `/api/auth/imagekit`. Zero private key exposure on client bundles.
   - Offline images are preserved in IndexedDB blobs and synchronized upon reconnection.
7. **Role-Based Security & Protection**:
   - **Administrator**: Full system governance and audited financial reversals.
   - **Warehouse Staff**: Authorized for stock intake, batch entry, and damage logging; **strictly blocked** from seeing purchase costs, selling prices, and ledgers.
   - **Booking Agent**: Permitted to view catalog, check stock, and issue invoices; **blocked** from user administration and financial ledgers.

---

## 🚀 Getting Started

### Prerequisites:
- Node.js >= 18 (Tested on v24.15.0)
- npm >= 9 (Tested on 11.12.1)

### Installation:
```bash
# Clone or navigate to the project directory
cd "e:/my apps/Client app/Noxderma"

# Install dependencies
npm install

# Start local development server (serves frontend & API route handlers)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```
noxderma/
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service Worker caching application shell
│   └── brand/                   # Official SVG logos & icons
├── docs/
│   └── architecture.md          # Technical architecture & deployment guide
├── firebase/
│   ├── firestore.rules          # Granular security rules protecting costs & ledgers
│   └── firestore.indexes.json   # Compound indexes (FEFO batch sorting, aging)
├── src/
│   ├── app/
│   │   ├── layout.tsx           # PWA Shell, theme provider, and offline banner
│   │   ├── page.tsx             # Live Executive Operations Dashboard
│   │   ├── sales/invoices/new/  # Offline Invoice Creator
│   │   ├── inventory/batches/   # FEFO Batch Inventory Management
│   │   ├── inventory/movements/ # Physical Stock Movement Ledger
│   │   ├── finance/credit/      # 3-Way Credit & WhatsApp Reminder Queue
│   │   ├── finance/pnl/         # Auditable Profit & Loss (P&L) Statement
│   │   ├── crm/leads/           # Leads CRM Pipeline Board
│   │   ├── crm/visits/          # Field Representative Visit Tracker
│   │   ├── settings/            # Central Business Branding & Legal Settings
│   │   ├── sync/                # Outbox Queue & Conflict Reconciliation
│   │   └── api/
│   │       ├── auth/imagekit/   # Signed upload token generator
│   │       └── sync/            # Idempotent offline transaction synchronizer
│   ├── components/
│   │   └── layout/              # Header, Sidebar (29 modules), OfflineBanner, AppShell
│   ├── features/                # Domain views & stateful features
│   ├── lib/
│   │   ├── firebase/            # Client Firebase config, Auth, Admin SDK
│   │   ├── offline/             # Dexie.js DB schema, Outbox queue, Sync engine
│   │   ├── image-storage/       # ImageStorageService (ImageKit abstraction)
│   │   ├── permissions/         # Role permission matrices & security guards
│   │   └── formatting/          # PKR currency & Asia/Karachi timezone formatters
│   └── types/                   # Shared TypeScript domain models
├── .env.example
├── .env.local
├── firebase.json
└── package.json
```

---

## ☁️ Deployment Strategy

1. **Frontend**:
   - Hosted at `https://noxderma.web.app/` via Firebase Hosting.
   - PWA Service Worker caches the application shell for instant offline loading.
2. **Backend API**:
   - Next.js Serverless Route Handlers deployed to a Vercel Serverless environment (or Firebase Functions 2nd Gen).
   - Enforces Firebase ID token validation, idempotency checks, and signed ImageKit token distribution.

---

## 📋 Milestone Progress

- [x] **Milestone 1 — Foundation & Application Shell**:
  - [x] Clean architecture & modular directory structure.
  - [x] TypeScript strict configuration & domain models.
  - [x] Tailwind CSS enterprise styling with dark/light mode.
  - [x] Firebase Client & Admin SDK integration.
  - [x] Firestore Security Rules & Compound Indexes.
  - [x] PWA manifest & Service Worker.
  - [x] Dexie.js IndexedDB local database & durable Outbox Queue.
  - [x] Collision-Safe Offline Invoice Numbering (`OFF-DEV01-YYMMDD-0001`).
  - [x] ImageStorageService abstraction & ImageKit signed token API route.
  - [x] Enterprise AppShell with 29-module collapsible Sidebar & Dynamic Category selector.
  - [x] Live Executive Dashboard with KPIs, Recharts sales trends, and FEFO alerts.
  - [x] Offline Invoice Creator with atomic persistence and printable receipt view.
  - [x] Central Business Settings (Brand, PKR, Asia/Karachi, 30-day credit policy).
  - [x] Three-Way Credit Dashboard & Day-31 WhatsApp reminder queue.
  - [x] FEFO Batch Management & Stock Movement Ledger.
  - [x] Auditable Profit & Loss Statement (P&L).
  - [x] Leads CRM Pipeline & Field Representative Visit Tracker.
- [ ] **Milestone 2**: Customers, Leads, Dynamic Categories, Manufacturers & ImageKit Catalog.
- [ ] **Milestone 3**: Inventory, Batch Management, FEFO Engine, Damaged Stock & Samples.
- [ ] **Milestone 4**: Sales, Offline Invoicing, Collision-safe Numbering & Outbox Sync Engine.
- [ ] **Milestone 5**: Finance, 3-Way Ledgers, Payment Allocation & Auditable P&L.
- [ ] **Milestone 6**: Field Visits, Market Observations & Sales Targets.
- [ ] **Milestone 7**: Marketing Workspace, WhatsApp Campaigns & Courier Integration Abstraction.
- [ ] **Milestone 8**: Dashboard Analytics, Audit Verification, Security Testing & Production Hardening.
