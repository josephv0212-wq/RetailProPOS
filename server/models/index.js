import { User } from './User.js';
import { Customer } from './Customer.js';
import { Item } from './Item.js';
import { Sale } from './Sale.js';
import { SaleItem } from './SaleItem.js';

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });

Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Sale.belongsTo(User, { foreignKey: 'userId', as: 'user' });

SaleItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

export { User, Customer, Item, Sale, SaleItem };
