import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const ItemUnitOfMeasure = sequelize.define('ItemUnitOfMeasure', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  itemId: {
    type: DataTypes.INTEGER,
    allowNull: false
    // Foreign key is handled by Sequelize associations in models/index.js
    // Removing explicit reference to avoid table name mismatches
  },
  unitOfMeasureId: {
    type: DataTypes.INTEGER,
    allowNull: false
    // Foreign key is handled by Sequelize associations in models/index.js
    // Removing explicit reference to avoid table name mismatches
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'item_unit_of_measures',
  indexes: [
    {
      unique: true,
      fields: ['itemId', 'unitOfMeasureId']
    }
  ]
});
