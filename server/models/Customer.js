import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const Customer = sequelize.define('Customer', {
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
  contactName: { 
    type: DataTypes.STRING,
    allowNull: false
  },
  companyName: {
    type: DataTypes.STRING
  },
  email: {
    type: DataTypes.STRING
  },
  phone: {
    type: DataTypes.STRING
  },
  contactType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  locationId: { 
    type: DataTypes.STRING
  },
  locationName: {
    type: DataTypes.STRING
  },
  isDefaultCustomer: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasPaymentMethod: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paymentMethodType: {
    type: DataTypes.STRING
  },
  last_four_digits: {
    type: DataTypes.STRING
  },
  cardBrand: {
    type: DataTypes.STRING
  },
  paymentMethodId: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSyncedAt: {
    type: DataTypes.DATE
  }
});
