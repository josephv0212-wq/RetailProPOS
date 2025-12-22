-- Migration: Create Orders and Payments tables (PostgreSQL version)
-- Use this for PostgreSQL databases

-- Orders Table
CREATE TABLE IF NOT EXISTS "Orders" (
  "id" SERIAL PRIMARY KEY,
  "invoiceNumber" VARCHAR(255) NOT NULL UNIQUE,
  "laneId" VARCHAR(255) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'PAID', 'VOIDED', 'REFUNDED')),
  "userId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE IF NOT EXISTS "Payments" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Orders" ("id") ON DELETE CASCADE,
  "provider" VARCHAR(255) NOT NULL DEFAULT 'AUTHORIZE_NET',
  "transactionId" VARCHAR(255) NOT NULL UNIQUE,
  "authCode" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'AUTHORIZED' CHECK ("status" IN ('AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED')),
  "amount" DECIMAL(10, 2) NOT NULL,
  "rawResponse" JSONB, -- PostgreSQL supports JSONB for better performance
  "settledAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

