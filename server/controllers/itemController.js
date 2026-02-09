import { Item } from '../models/index.js';
import { Op } from 'sequelize';
import { getItemsFromPricebookByName, syncItemsFromZoho as syncItemsFromZohoService } from '../services/zohoService.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';
import { extractUnitFromZohoItem, syncItemUnitOfMeasure } from '../utils/itemUnitOfMeasureHelper.js';
import { zohoCache } from '../utils/cache.js';

export const getItems = async (req, res) => {
  try {
    const { search, isActive, includeImageData } = req.query;
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

    // Exclude imageData by default to keep list response small and fast (~28s -> sub-second when 172 items)
    const attributes = includeImageData === 'true' || includeImageData === '1'
      ? undefined
      : ['id', 'zohoId', 'name', 'sku', 'description', 'price', 'taxId', 'taxName', 'taxPercentage', 'unit', 'isActive', 'lastSyncedAt'];

    const items = await Item.findAll({
      where,
      order: [['name', 'ASC']],
      ...(attributes && { attributes })
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
    // #region agent log
    const t0Pricebook = Date.now();
    // #endregion
    const PRICEBOOK_ITEMS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    const cacheKey = `pricebook_zoho_items_${pricebookName}`;
    let zohoItems = zohoCache.get(cacheKey);
    let fromCache = false;
    if (!zohoItems || !Array.isArray(zohoItems)) {
      zohoItems = await getItemsFromPricebookByName(pricebookName);
      zohoCache.set(cacheKey, zohoItems, PRICEBOOK_ITEMS_CACHE_TTL_MS);
      console.log(`Retrieved ${zohoItems.length} items from Zoho pricebook "${pricebookName}" (cached)`);
    } else {
      fromCache = true;
      console.log(`Using cached pricebook items for "${pricebookName}" (${zohoItems.length} items)`);
    }
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemController:getItemsFromPricebook',message:fromCache?'from cache':'from Zoho',data:{pricebookName,fromCache,zohoItemsCount:zohoItems?.length,durationMsSoFar:Date.now()-t0Pricebook},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:1024/ingest/d43f1d4c-4d33-4f77-a4e3-9e9d56debc45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'itemController:getItemsFromPricebook end',message:'merged items ready',data:{durationMs:Date.now()-t0Pricebook,mergedCount:mergedItems?.length},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
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

export const updateItemImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imageData } = req.body;

    // Allow null or empty string to remove image, otherwise require valid string
    if (imageData !== null && imageData !== '' && (!imageData || typeof imageData !== 'string')) {
      return sendValidationError(res, 'imageData must be a base64 string, null, or empty string');
    }

    const item = await Item.findByPk(id);

    if (!item) {
      return sendNotFound(res, 'Item');
    }

    // Set to null if empty string or null, otherwise set the image data
    item.imageData = (imageData === null || imageData === '') ? null : imageData;
    await item.save();

    const message = item.imageData ? 'Item image updated successfully' : 'Item image removed successfully';
    return sendSuccess(res, { item }, message);
  } catch (err) {
    console.error('Update item image error:', err);
    return sendError(res, 'Failed to update item image', 500, err);
  }
};

export const syncItemsFromZoho = async (req, res) => {
  try {
    console.log('🔄 Syncing items from Zoho...');
    const zohoItems = await syncItemsFromZohoService();
    const now = new Date();
    const zohoIds = (zohoItems || []).map((z) => z.item_id).filter(Boolean);

    // Count existing items for stats (before bulk upsert)
    const existingCount = zohoIds.length
      ? await Item.count({ where: { zohoId: { [Op.in]: zohoIds } } })
      : 0;
    const created = zohoIds.length - existingCount;
    const updated = existingCount;

    // Build rows for bulk upsert
    const rows = (zohoItems || []).map((zohoItem) => {
      const unit = extractUnitFromZohoItem(zohoItem);
      return {
        zohoId: zohoItem.item_id,
        name: zohoItem.name,
        sku: zohoItem.sku || null,
        description: zohoItem.description || null,
        price: parseFloat(zohoItem.rate) || 0,
        taxId: zohoItem.tax_id || null,
        taxName: zohoItem.tax_name || null,
        taxPercentage: parseFloat(zohoItem.tax_percentage) || 0,
        unit: unit,
        isActive: zohoItem.status === 'active',
        lastSyncedAt: now
      };
    });

    if (rows.length > 0) {
      await Item.bulkCreate(rows, {
        updateOnDuplicate: ['name', 'sku', 'description', 'price', 'taxId', 'taxName', 'taxPercentage', 'unit', 'isActive', 'lastSyncedAt'],
        conflictAttributes: ['zohoId']
      });
    }

    // Sync unit of measure for items that have a unit (in parallel, batched)
    const itemsWithUnit = (zohoItems || []).filter((z) => extractUnitFromZohoItem(z));
    if (itemsWithUnit.length > 0) {
      const dbItemsByZohoId = new Map(
        (await Item.findAll({ where: { zohoId: { [Op.in]: itemsWithUnit.map((z) => z.item_id) } } })).map((i) => [i.zohoId, i])
      );
      await Promise.all(
        itemsWithUnit.map((zohoItem) => {
          const item = dbItemsByZohoId.get(zohoItem.item_id);
          return item ? syncItemUnitOfMeasure(item, zohoItem) : Promise.resolve(false);
        })
      );
    }

    console.log(`✅ Item sync completed: ${created} created, ${updated} updated (${zohoItems.length} total)`);

    // Fetch all active items from database to return
    const allItems = await Item.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });

    return sendSuccess(res, {
      items: allItems,
      syncStats: {
        total: (zohoItems || []).length,
        created,
        updated,
        active: allItems.length
      }
    }, 'Items synced successfully from Zoho');
  } catch (err) {
    console.error('Sync items from Zoho error:', err);
    return sendError(res, `Failed to sync items from Zoho: ${err.message}`, 500, err);
  }
};
