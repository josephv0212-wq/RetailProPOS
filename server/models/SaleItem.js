import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const SaleItem = sequelize.define('SaleItem', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  itemId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  zohoItemId: {
    type: DataTypes.STRING
  },
  itemName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 1
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  taxPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  lineTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
});
