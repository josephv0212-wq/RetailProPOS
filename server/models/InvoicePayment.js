import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const InvoicePayment = sequelize.define('InvoicePayment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true  // Nullable to allow Zoho sync replace-all (InvoicePayment rows orphaned during full customer sync)
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'invoice or salesorder'
  },
  documentNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Invoice/SO number (e.g. INV-123, SO-456)'
  },
  documentId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Zoho document ID'
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Original invoice/SO amount'
  },
  amountCharged: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Amount charged (including 3% fee)'
  },
  ccFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '3% processing fee'
  },
  paymentType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'card or ach (card replaces credit_card/debit_card)'
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Authorize.Net transaction ID'
  },
  zohoPaymentRecorded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True if recorded in Zoho (invoices only)'
  },
  locationId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'invoice_payments',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});
