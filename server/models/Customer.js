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
  bankAccountLast4: {
    type: DataTypes.STRING
  },
  paymentMethodId: {
    type: DataTypes.STRING
  },
  customerProfileId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Authorize.net Customer Information Manager (CIM) profile ID'
  },
  customerPaymentProfileId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Authorize.net CIM payment profile ID'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Raw Zoho contact status (e.g., active/inactive)'
  },
  lastSyncedAt: {
    type: DataTypes.DATE
  },
  pricebook_name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Cached from Zoho for fast customer select'
  },
  tax_preference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Cached from Zoho (e.g. tax exemption)'
  },
  zohoCards: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON array of cards from Zoho for stored payment methods'
  },
  zohoProfileSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When Zoho profile (pricebook, tax, cards) was last synced'
  }
});
