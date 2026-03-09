import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const AutoInvoiceCustomer = sequelize.define('AutoInvoiceCustomer', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Customer ID from Customer table'
  },
  frequency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'weekly',
    comment: 'weekly or monthly'
  },
  lastChargedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When customer was last auto-charged (used to determine if due for next run)'
  }
}, {
  tableName: 'auto_invoice_customers',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});
