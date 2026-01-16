import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const User = sequelize.define('User', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  username: { 
    type: DataTypes.STRING, 
    allowNull: false,
    unique: true 
  },
  password: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  role: { 
    type: DataTypes.STRING, 
    defaultValue: 'cashier' 
  },
  locationId: { 
    type: DataTypes.STRING,
    allowNull: false
  },
  locationName: {
    type: DataTypes.STRING
  },
  taxPercentage: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 7.5
  },
  // Zoho Books Settings > Taxes tax_id that corresponds to this user's location tax rate
  // Used when creating Zoho sales receipts so line items get the correct tax rule.
  zohoTaxId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  terminalIP: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'IP address of the PAX terminal assigned to this user (e.g., 192.168.1.100 or localhost)'
  },
  terminalPort: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Port number for the PAX terminal (e.g., 4430 for USB, 10009 for WiFi)'
  },
  terminalNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'VP100 serial number or terminal number registered in Valor Portal/Authorize.Net (required for Valor Connect cloud-to-cloud payments)'
  }
});
