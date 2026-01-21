import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const Sale = sequelize.define('Sale', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  taxAmount: { 
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  taxPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  ccFee: { 
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  total: { 
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  paymentType: { 
    type: DataTypes.STRING,
    allowNull: false
  },
  locationId: { 
    type: DataTypes.STRING,
    allowNull: false
  },
  locationName: {
    type: DataTypes.STRING
  },
  customerId: {
    type: DataTypes.INTEGER
  },
  zohoCustomerId: {
    type: DataTypes.STRING
  },
  userId: {
    type: DataTypes.INTEGER
  },
  transactionId: {
    type: DataTypes.STRING
  },
  zohoSalesReceiptId: {
    type: DataTypes.STRING
  },
  syncedToZoho: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  syncError: {
    type: DataTypes.TEXT
  },
  notes: {
    type: DataTypes.TEXT
  },
  cancelledInZoho: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this sale has been cancelled/voided in Zoho'
  }
});
