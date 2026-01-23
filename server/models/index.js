import { User } from './User.js';
import { Customer } from './Customer.js';
import { Item } from './Item.js';
import { Sale } from './Sale.js';
import { SaleItem } from './SaleItem.js';
import { UnitOfMeasure } from './UnitOfMeasure.js';
import { ItemUnitOfMeasure } from './ItemUnitOfMeasure.js';

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });

Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Sale.belongsTo(User, { foreignKey: 'userId', as: 'user' });

SaleItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

// Many-to-many relationship between Items and UnitOfMeasure
Item.belongsToMany(UnitOfMeasure, { 
  through: ItemUnitOfMeasure, 
  foreignKey: 'itemId', 
  otherKey: 'unitOfMeasureId',
  as: 'unitOfMeasures'
});
UnitOfMeasure.belongsToMany(Item, { 
  through: ItemUnitOfMeasure, 
  foreignKey: 'unitOfMeasureId', 
  otherKey: 'itemId',
  as: 'items'
});

export { User, Customer, Item, Sale, SaleItem, UnitOfMeasure, ItemUnitOfMeasure };
