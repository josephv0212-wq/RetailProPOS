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
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});
