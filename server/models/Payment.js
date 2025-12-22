import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * Payment Model
 * Stores payment transaction details from Authorize.net
 * Linked to an Order via orderId foreign key
 */
export const Payment = sequelize.define('Payment', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Foreign key to Order table'
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'AUTHORIZE_NET',
    comment: 'Payment provider identifier'
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Authorize.net transaction ID (transId)'
  },
  authCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Authorization code from processor'
  },
  status: {
    type: DataTypes.ENUM('AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED'),
    allowNull: false,
    defaultValue: 'AUTHORIZED',
    comment: 'Payment transaction status'
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Payment amount'
  },
  rawResponse: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Minimal safe fields from Authorize.net response (no sensitive card data)'
  },
  settledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When transaction was settled (if applicable)'
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['transactionId']
    },
    {
      fields: ['orderId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['createdAt']
    }
  ]
});

