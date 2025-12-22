import { User } from './User.js';
import { Customer } from './Customer.js';
import { Item } from './Item.js';
import { Sale } from './Sale.js';
import { SaleItem } from './SaleItem.js';
import { Order } from './Order.js';
import { Payment } from './Payment.js';

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });

Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Sale.belongsTo(User, { foreignKey: 'userId', as: 'user' });

SaleItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

// Order and Payment relationships
Order.hasMany(Payment, { foreignKey: 'orderId', as: 'payments' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export { User, Customer, Item, Sale, SaleItem, Order, Payment };
