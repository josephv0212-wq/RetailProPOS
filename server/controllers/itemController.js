import { Item } from '../models/index.js';
import { Op } from 'sequelize';
import { getItemsFromPricebookByName } from '../services/zohoService.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

export const getItems = async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const items = await Item.findAll({
      where,
      order: [['name', 'ASC']]
    });

    return sendSuccess(res, { items });
  } catch (err) {
    console.error('Get items error:', err);
    return sendError(res, 'Failed to fetch items', 500, err);
  }
};

export const getItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Item.findByPk(id);

    if (!item) {
      return sendNotFound(res, 'Item');
    }

    return sendSuccess(res, { item });
  } catch (err) {
    console.error('Get item error:', err);
    return sendError(res, 'Failed to fetch item', 500, err);
  }
};

export const getItemsFromPricebook = async (req, res) => {
  try {
    const { pricebookName } = req.query;

    if (!pricebookName) {
      return sendValidationError(res, 'Pricebook name is required');
    }

    console.log(`Fetching items from pricebook: "${pricebookName}"`);

    // Fetch items from Zoho pricebook
    const zohoItems = await getItemsFromPricebookByName(pricebookName);
    
    console.log(`Retrieved ${zohoItems.length} items from Zoho pricebook "${pricebookName}"`);

    // Get all active items from database
    const allDbItems = await Item.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });

    // Create a map of pricebook items by zohoId for quick lookup
    const pricebookItemsMap = new Map();
    const pricebookZohoIds = new Set();

    // Extract all zohoIds from pricebook items
    const zohoIds = zohoItems.map(item => item.item_id).filter(Boolean);
    
    // Fetch all matching database items in a single query (optimized)
    const dbItemsMap = new Map();
    if (zohoIds.length > 0) {
      const dbItems = await Item.findAll({
        where: { 
          zohoId: { [Op.in]: zohoIds },
          isActive: true
        }
      });
      
      // Create a map for O(1) lookup
      dbItems.forEach(item => {
        dbItemsMap.set(item.zohoId, item);
      });
    }

    // Process pricebook items and match with database items
    const validPricebookItems = zohoItems
      .map((zohoItem) => {
        const dbItem = dbItemsMap.get(zohoItem.item_id);
        
        if (dbItem) {
          pricebookZohoIds.add(zohoItem.item_id);
          
          // Use pricebook price, but database ID and other fields
          const item = {
            id: dbItem.id,
            zohoId: zohoItem.item_id,
            name: zohoItem.name || dbItem.name,
            sku: zohoItem.sku || dbItem.sku || null,
            description: zohoItem.description || dbItem.description || null,
            price: zohoItem.price || 0, // Use pricebook price (this is the key difference)
            taxId: zohoItem.tax_id || dbItem.taxId || null,
            taxName: zohoItem.tax_name || dbItem.taxName || null,
            taxPercentage: zohoItem.tax_percentage || dbItem.taxPercentage || 0,
            unit: zohoItem.unit || dbItem.unit || null,
            isActive: zohoItem.status === 'active' && dbItem.isActive,
            fromPricebook: true, // Flag to indicate this item has pricebook pricing
            zohoData: zohoItem
          };

          pricebookItemsMap.set(dbItem.id, item);
          return item;
        }
        return null;
      })
      .filter(item => item !== null);

    // Now merge: items in pricebook use pricebook prices, others use regular prices
    const mergedItems = allDbItems.map(dbItem => {
      // If item is in pricebook, use pricebook version with custom price
      if (pricebookItemsMap.has(dbItem.id)) {
        return pricebookItemsMap.get(dbItem.id);
      }
      
      // Otherwise, use regular database item with regular price
      return {
        id: dbItem.id,
        zohoId: dbItem.zohoId,
        name: dbItem.name,
        sku: dbItem.sku,
        description: dbItem.description,
        price: parseFloat(dbItem.price) || 0, // Regular price
        taxId: dbItem.taxId,
        taxName: dbItem.taxName,
        taxPercentage: parseFloat(dbItem.taxPercentage) || 0,
        unit: dbItem.unit,
        isActive: dbItem.isActive,
        fromPricebook: false // Flag to indicate this uses regular pricing
      };
    });

    console.log(`Returning ${mergedItems.length} merged items (${validPricebookItems.length} from pricebook)`);
    
    return sendSuccess(res, { 
      items: mergedItems,
      pricebookName,
      count: mergedItems.length,
      pricebookItemsCount: validPricebookItems.length
    });
  } catch (err) {
    console.error('Get items from pricebook error:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      pricebookName: req.query.pricebookName
    });
    return sendError(res, `Failed to fetch items from pricebook: ${err.message}`, 500, err);
  }
};
