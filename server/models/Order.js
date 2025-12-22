import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * Order Model
 * Represents a POS order that is waiting for payment reconciliation
 * The cashier creates an order, then enters the invoice number in Authorize.net 2.0 Windows app
 * The reconciliation worker matches completed transactions to orders
 */
export const Order = sequelize.define('Order', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Unique invoice number (e.g., LANE01-20240115-000123)'
  },
  laneId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Lane identifier (e.g., LANE-01)'
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Order total amount'
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'PAID', 'VOIDED', 'REFUNDED'),
    defaultValue: 'OPEN',
    allowNull: false,
    comment: 'Order payment status'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Cashier who created the order'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional order notes'
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['invoiceNumber']
    },
    {
      fields: ['status']
    },
    {
      fields: ['laneId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

