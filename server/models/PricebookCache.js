import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const PricebookCache = sequelize.define('PricebookCache', {
  pricebookName: {
    type: DataTypes.STRING(255),
    primaryKey: true,
    field: 'pricebookName'
  },
  itemsJson: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array of Zoho pricebook items'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'PricebookCaches',
  timestamps: false,
  createdAt: false,
  updatedAt: false
});
