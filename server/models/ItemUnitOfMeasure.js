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
    allowNull: false,
    references: {
      model: 'Items', // Sequelize pluralizes 'Item' to 'Items'
      key: 'id'
    }
  },
  unitOfMeasureId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'unit_of_measures', // Explicit table name from UnitOfMeasure model
      key: 'id'
    }
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
