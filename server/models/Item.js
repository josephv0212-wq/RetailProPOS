import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const Item = sequelize.define('Item', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  zohoId: { 
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  name: { 
    type: DataTypes.STRING,
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  price: { 
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  taxId: {
    type: DataTypes.STRING
  },
  taxName: {
    type: DataTypes.STRING
  },
  taxPercentage: { 
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  unit: {
    type: DataTypes.STRING
  },
  imageData: {
    type: DataTypes.TEXT, // Base64-encoded image for simple storage/serving
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSyncedAt: {
    type: DataTypes.DATE
  }
});
