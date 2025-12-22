-- Migration: Create Orders and Payments tables
-- Compatible with both PostgreSQL and SQLite
-- Run this manually if auto-sync is disabled in production

-- Orders Table
CREATE TABLE IF NOT EXISTS "Orders" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "invoiceNumber" VARCHAR(255) NOT NULL UNIQUE,
  "laneId" VARCHAR(255) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'PAID', 'VOIDED', 'REFUNDED')),
  "userId" INTEGER,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE IF NOT EXISTS "Payments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "orderId" INTEGER NOT NULL,
  "provider" VARCHAR(255) NOT NULL DEFAULT 'AUTHORIZE_NET',
  "transactionId" VARCHAR(255) NOT NULL UNIQUE,
  "authCode" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'AUTHORIZED' CHECK ("status" IN ('AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED')),
  "amount" DECIMAL(10, 2) NOT NULL,
  "rawResponse" TEXT, -- JSON stored as TEXT in SQLite, JSONB in PostgreSQL
  "settledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Orders" ("id") ON DELETE CASCADE
);

-- Indexes for Orders
CREATE INDEX IF NOT EXISTS "idx_orders_invoice_number" ON "Orders" ("invoiceNumber");
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "Orders" ("status");
CREATE INDEX IF NOT EXISTS "idx_orders_lane_id" ON "Orders" ("laneId");
CREATE INDEX IF NOT EXISTS "idx_orders_created_at" ON "Orders" ("createdAt");

-- Indexes for Payments
CREATE INDEX IF NOT EXISTS "idx_payments_transaction_id" ON "Payments" ("transactionId");
CREATE INDEX IF NOT EXISTS "idx_payments_order_id" ON "Payments" ("orderId");
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "Payments" ("status");
CREATE INDEX IF NOT EXISTS "idx_payments_created_at" ON "Payments" ("createdAt");

