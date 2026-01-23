import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const UnitOfMeasure = sequelize.define('UnitOfMeasure', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  unitName: { 
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  symbol: {
    type: DataTypes.STRING,
    allowNull: false
  },
  unitPrecision: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'unit_of_measures'
});
