# Noxderma — Enterprise Offline-First Pharmaceutical ERP & CRM Architecture

## 1. Concise Architecture Overview

Noxderma is an offline-first enterprise business management system designed for pharmaceutical distribution. It bridges disconnected field operations (medical reps, booking agents, remote warehouse staff) with central enterprise control (inventory, ledger accounting, profit & loss, compliance, marketing).

### Architectural Pillars:
- **Client Application**: Next.js App Router with TypeScript, Tailwind CSS, and Lucide icons running as a Progressive Web App (PWA) with persistent Service Worker caching for the application shell.
- **Durable Offline Storage**: Client-side IndexedDB powered by **Dexie.js**. All master catalog records (products, customers, batches) are cached locally; all offline business actions (invoices, visits, movements, payments) are written atomically into a **durable transactional outbox** that survives browser reboots and hardware power-cycles.
- **Collision-Safe Offline Numbering**: Generates deterministic, globally unique IDs combining `{device_id}-{timestamp}-{sequence}`. Invoices carry a provisional client reference and a permanent reconciliation sequence.
- **Trusted Central Database**: **Google Cloud Firestore** acting as the central source of truth for organization settings, products, batch-wise inventory with FEFO (First Expiry, First Out) allocation, financial ledgers, CRM records, and audit logs.
- **Trusted Server Layer**: Next.js Serverless Route Handlers running on a secure server environment (Vercel / Firebase Cloud Functions) using Firebase Admin SDK to execute privileged financial operations, recompute COGS from verified batch costs, enforce append-only ledger entries, and issue signed upload tokens for external image storage.
- **Image Storage Abstraction**: High-resolution product and marketing images are stored in **ImageKit.io** via an `ImageStorageService` interface. The client never holds private API keys. Images queued offline are preserved as local blobs and uploaded only after network re-establishment.

---

## 2. Exact Deployment Arrangement

### Frontend:
- **Public Domain**: `https://noxderma.web.app/` (Firebase Hosting) with custom domain support configured via DNS CNAME/A records.
- **Hosting Strategy**:
  - **Static / SPA Export Mode (`output: 'export'`)**: Compiles the UI shell and client-side modules to static assets (`out/` directory) served via Firebase Hosting's global CDN with low latency across Pakistan (`Asia/Karachi`) and international locations.
  - **Environment Variables**: Frontend environment variables prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_IMAGEKIT_*`, `NEXT_PUBLIC_API_URL`).

### Backend APIs:
- **Deployment**: Next.js Serverless Route Handlers deployed to a Vercel Serverless runtime (free tier) or Firebase Cloud Functions (2nd Gen).
- **CORS & Domain Policy**: API routes strictly allow requests from `https://noxderma.web.app`, `https://noxderma.firebaseapp.com`, and `http://localhost:3000`.
- **Zero Secret Leakage**: The Firebase Admin service account key and ImageKit Private Key remain exclusively within the server environment.

---

## 3. Directory Structure

```
noxderma/
├── .env.example                     # Environment template
├── .env.local                       # Active environment configurations
├── .firebaserc                      # Firebase project identifier
├── firebase.json                    # Firebase hosting & firestore rules binding
├── firebase/
│   ├── firestore.rules              # Granular role-based security rules
│   └── firestore.indexes.json       # Compound queries (FEFO, ledger aging)
├── public/
│   ├── manifest.json                # Progressive Web App manifest
│   ├── sw.js                        # Service Worker caching application shell
│   ├── icons/                       # PWA icons (192x192, 512x512, maskable)
│   └── brand/                       # Logos and favicons
├── docs/
│   ├── architecture.md              # System architecture & deployment
│   ├── data-model.md                # Firestore schema & collections
│   ├── financial-rules.md           # Accounting, FEFO, COGS & Ledgers
│   └── offline-sync.md              # Outbox queue & conflict reconciliation
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root layout, theme, offline banner
│   │   ├── page.tsx                 # Executive Dashboard & KPIs
│   │   ├── manifest.ts              # Dynamic PWA manifest handler
│   │   ├── api/
│   │   │   ├── auth/imagekit/       # Signed ImageKit token provider
│   │   │   ├── sync/                # Idempotent offline queue synchronizer
│   │   │   └── health/              # Healthcheck & latency probe
│   │   ├── leads/                   # Leads CRM module
│   │   ├── customers/               # Customer profiles & ledgers
│   │   ├── visits/                  # Field rep visit tracking
│   │   ├── products/                # Product catalog & batch details
│   │   ├── inventory/               # FEFO stock, adjustments, damage
│   │   ├── purchases/               # Manufacturer POs & goods receipts
│   │   ├── sales/                   # Invoices, bookings & counter sales
│   │   ├── finance/                 # Ledgers, P&L, 3-way credit, aging
│   │   ├── marketing/               # Campaign creator & WhatsApp share
│   │   └── settings/                # Business branding & enterprise settings
│   ├── components/
│   │   ├── ui/                      # shadcn/ui inspired primitives (Button, Card, Input)
│   │   └── layout/                  # Sidebar, Header, OfflineBanner, AppShell
│   ├── features/                    # Feature modules (domain views & logic)
│   ├── lib/
│   │   ├── firebase/                # Client config, Auth, Firestore helpers, Admin SDK
│   │   ├── offline/                 # Dexie DB, Outbox queue, Sync engine
│   │   ├── image-storage/           # ImageStorageService (ImageKit provider)
│   │   ├── permissions/             # Role guards (Admin, Warehouse, Booking)
│   │   └── formatting/              # PKR currency, Asia/Karachi time, numbers
│   └── types/                       # Shared domain TypeScript contracts
└── package.json
```

---

## 4. Initial Firestore Data Model

The database is structured to separate sensitive financial metrics from operational logistics:

1. `organizationSettings/primary`: Brand identity, currency (PKR), Asia/Karachi timezone, invoice numbering prefix, credit rules (30-day default), alert thresholds.
2. `categories/{categoryId}`: Dynamic business categories (e.g., Pharmacy, Cosmetics, Supplements).
3. `users/{userId}`: User profiles, assigned roles (`admin`, `warehouse_staff`, `booking_user`, `sales_rep`), contact information, active status.
4. `products/{productId}`: Public operational product info (SKU, barcode, name, pack size, units per pack, images, reorder threshold).
5. `productPricing/{productId}`: **Restricted collection** (purchase costs, trade prices, distributor rates, maximum retail prices, tax rates).
6. `inventoryBatches/{batchId}`: Batch number, product ID, manufacturer ID, manufacturing date, expiry date, received quantity, remaining quantity, blocked quantity.
7. `batchCostRecords/{batchId}`: **Restricted collection** storing landed cost per pack and per unit for historical COGS tracing.
8. `stockMovements/{movementId}`: Immutable ledger of all physical additions/deductions (Receipt, Sale, Return, Damage, Sample, Adjustment).
9. `inventoryProjections/{productId}`: Denormalized cached stock counts (total stock, available stock, reserved stock, near-expiry count).
10. `customers/{customerId}`: Pharmacies, distributors, direct clinics, credit limits, terms, contact WhatsApp, assigned rep.
11. `leads/{leadId}`: CRM pipeline stages (New, Contacted, Qualified, Follow-up, Converted, Lost).
12. `customerVisits/{visitId}`: Rep field observations, products discussed, competitor Intel, follow-up dates.
13. `manufacturers/{manufacturerId}`: Pharma manufacturers, terms, contact details, opening payables balance.
14. `purchaseOrders/{poId}` & `goodsReceipts/{receiptId}`: Landed cost allocations, batch entries upon receipt.
15. `invoices/{invoiceId}`: Sales transactions, customer details, line items, batch allocations, discounts, gross total, net total, paid amount, balance.
16. `payments/{paymentId}` & `paymentAllocations/{allocationId}`: Specific invoice applications preventing duplicate credits.
17. `ledgerAccounts/{accountId}` & `ledgerEntries/{entryId}`: Balanced multi-ledger entries for Manufacturers, Distributors, Pharmacies, Cash, Bank, COGS, Damage, and Samples.
18. `auditLogs/{logId}`: Append-only system audit trail capturing user ID, device ID, action, previous/new payloads.
19. `syncOperations/{opId}` & `syncConflicts/{conflictId}`: Idempotent transaction tracking and discrepancy resolver.

---

## 5. Security & Permissions Strategy

### Three Initial Roles:
1. **Administrator**: Full read/write access to all modules, financial ledgers, profit & loss, settings, user management, and conflict reconciliation. Reversals are audited rather than hard-deleted.
2. **Warehouse Staff**: Authorized for operational intake, goods receipts, batch entry, recording damaged stock, sample issues, and physical stocktakes. **Strictly blocked** at both Firestore Security Rules and UI levels from viewing purchase costs, trade prices, sales invoices, supplier payables, and profit figures.
3. **Booking User**: Authorized to search catalog, check available stock, create sales bookings/invoices, enter customer deliveries, and work offline. **Strictly blocked** from user administration, business settings modification, purchase costs, inventory revaluation, and master financial ledgers.

---

## 6. ImageKit Upload Strategy

- **Storage Separation**: Product images and marketing graphics are stored externally in ImageKit.io. Binary blobs are never saved in Firestore documents.
- **Secure Token Generation**: The client requests signed authentication parameters (`token`, `expire`, `signature`) from the trusted Next.js API route `/api/auth/imagekit`. The client directly uploads the binary file to ImageKit using these parameters. Private keys are never exposed.
- **Offline Handling**: Images captured offline are preserved in IndexedDB table `pendingImages` as base64/blobs. When connectivity is re-established, the sync worker uploads them to ImageKit, receives the confirmed CDN URL and file ID, and links them to the Firestore document.

---

## 7. Offline Transaction & Synchronization Strategy

- **Local Persistence**: All operations made offline are written to Dexie.js IndexedDB tables (`invoices`, `stockMovements`, `outboxQueue`) in an atomic transaction.
- **Idempotency**: Every offline transaction is stamped with a deterministic UUIDv4 idempotency key `{device_id}-{timestamp}-{sequence}`.
- **Collision-Safe Numbering**: Invoices carry a client-provisional reference (e.g., `OFF-DEV01-00042`) which is visible and printable immediately. Upon synchronization, the server assigns the official fiscal invoice sequence while preserving the provisional reference in the audit log.
- **Durable Outbox**: A FIFO queue processes pending actions in dependency order (e.g., New Customer must sync before an Invoice referencing that customer).
- **Conflict Handling**: If two offline devices attempt to sell the exact same batch quantity exceeding physical inventory, the second transaction is marked with `SYNC_CONFLICT_STOCK_EXHAUSTED` and routed to the Administrator Reconciliation Dashboard without silent overwriting or silent deletion.

---

## 8. Milestone Checklist

- [x] **Milestone 1**: Foundation & Application Shell (Architecture, Next.js, TypeScript, Tailwind, PWA manifest, Service Worker, Dexie.js offline DB, outbox queue, Firebase Auth & Firestore rules, enterprise AppShell, live Executive Dashboard).
- [ ] **Milestone 2**: Customers, Leads, Dynamic Categories, Manufacturers & ImageKit Catalog.
- [ ] **Milestone 3**: Inventory, Batch Management, FEFO Engine, Damaged Stock & Samples.
- [ ] **Milestone 4**: Sales, Offline Invoicing, Collision-safe Numbering & Outbox Sync Engine.
- [ ] **Milestone 5**: Finance, 3-Way Ledgers (Manufacturer/Distributor/Pharmacy), Payment Allocation & Auditable P&L.
- [ ] **Milestone 6**: Field Visits, Market Observations & Sales Targets.
- [ ] **Milestone 7**: Marketing Workspace, WhatsApp Campaigns & Courier Integration Abstraction.
- [ ] **Milestone 8**: Dashboard Analytics, Audit Verification, Security Testing & Production Hardening.

---

## 9. Known Technical Limitations & Business Decisions

1. **Free-Tier Scheduler Frequency**: Vercel Cron on the hobby free tier executes once per day. Automated 30-day payment reminders are designed with a hybrid model: daily server cron checks overdue invoices and populates a WhatsApp reminder queue, plus on-demand checks when authorized staff access the Credit Dashboard.
2. **Device Offline Stock Blindspot**: Disconnected devices cannot know real-time stock deductions made by other field reps. Noxderma implements configurable offline sales caps (e.g., maximum 5 units per offline invoice) and near-zero stock warnings to minimize conflict risk.
3. **WhatsApp Automatic Sending**: Direct zero-click message delivery requires an official WhatsApp Business API account with approved templates and payment to Meta. Until configured, Noxderma provides a 1-click WhatsApp web/app bridge prefilling phone and message templates.
