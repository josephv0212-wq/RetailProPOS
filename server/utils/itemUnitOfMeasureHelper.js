import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/db.js';
import { UnitOfMeasure, ItemUnitOfMeasure } from '../models/index.js';

/**
 * Extracts unit of measure from Zoho item data
 * @param {Object} zohoItem - Zoho item object
 * @returns {string|null} Unit of measure string or null
 */
export const extractUnitFromZohoItem = (zohoItem) => {
  return zohoItem.unit || zohoItem.unit_name || zohoItem.unit_of_measure || zohoItem.um || null;
};

/**
 * Finds or creates a UnitOfMeasure
 * @param {string} unit - Unit name/symbol
 * @returns {Promise<Object>} UnitOfMeasure instance
 */
export const findOrCreateUnitOfMeasure = async (unit) => {
  if (!unit) return null;

  // Find existing unit by symbol or unitName
  let matchingUnit = await UnitOfMeasure.findOne({
    where: {
      [Op.or]: [
        { symbol: unit },
        { unitName: unit }
      ]
    }
  });

  // Create if doesn't exist
  if (!matchingUnit) {
    matchingUnit = await UnitOfMeasure.create({
      unitName: unit,
      symbol: unit,
      unitPrecision: 0
    });
    console.log(`✅ Created UnitOfMeasure: ${unit} (ID: ${matchingUnit.id})`);
  }

  return matchingUnit;
};

/**
 * Sets a UnitOfMeasure as default for an item
 * @param {number} itemId - Item ID
 * @param {number} unitOfMeasureId - UnitOfMeasure ID
 * @returns {Promise<void>}
 */
export const setItemUnitOfMeasureAsDefault = async (itemId, unitOfMeasureId) => {
  if (!itemId || !unitOfMeasureId) {
    throw new Error('Item ID and UnitOfMeasure ID are required');
  }

  // First, unset all other defaults for this item
  await ItemUnitOfMeasure.update(
    { isDefault: false },
    { where: { itemId } }
  );

  // Check if relationship already exists
  const existingItemUnit = await ItemUnitOfMeasure.findOne({
    where: {
      itemId,
      unitOfMeasureId
    }
  });

  if (existingItemUnit) {
    // Update existing relationship to be default
    await existingItemUnit.update({ isDefault: true });
    console.log(`✅ Updated ItemUnitOfMeasure: itemId=${itemId}, unitOfMeasureId=${unitOfMeasureId}`);
  } else {
    // Try to create new relationship
    try {
      await ItemUnitOfMeasure.create({
        itemId,
        unitOfMeasureId,
        isDefault: true
      });
      console.log(`✅ Created ItemUnitOfMeasure: itemId=${itemId}, unitOfMeasureId=${unitOfMeasureId}`);
    } catch (createError) {
      // If create fails due to foreign key constraint, use raw SQL
      if (createError.name === 'SequelizeForeignKeyConstraintError') {
        console.warn(`⚠️ Standard create failed due to FK constraint, trying raw SQL insert...`);
        try {
          await sequelize.query(
            `INSERT OR IGNORE INTO item_unit_of_measures (itemId, unitOfMeasureId, isDefault, createdAt, updatedAt) 
             VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
            {
              replacements: [itemId, unitOfMeasureId, 1],
              type: QueryTypes.INSERT
            }
          );
          console.log(`✅ Created ItemUnitOfMeasure via raw SQL: itemId=${itemId}, unitOfMeasureId=${unitOfMeasureId}`);
        } catch (sqlError) {
          console.error(`❌ Raw SQL insert also failed:`, sqlError.message);
          throw sqlError;
        }
      } else {
        throw createError;
      }
    }
  }
};

/**
 * Syncs unit of measure for an item from Zoho data
 * @param {Object} item - Item instance with ID
 * @param {Object} zohoItem - Zoho item data
 * @returns {Promise<boolean>} True if sync was successful, false otherwise
 */
export const syncItemUnitOfMeasure = async (item, zohoItem) => {
  try {
    if (!item || !item.id) {
      console.error(`⚠️ Invalid item provided for UM sync`);
      return false;
    }

    const unit = extractUnitFromZohoItem(zohoItem);
    if (!unit) {
      return true; // No unit to sync, but not an error
    }

    // Find or create UnitOfMeasure
    const matchingUnit = await findOrCreateUnitOfMeasure(unit);
    if (!matchingUnit || !matchingUnit.id) {
      console.error(`⚠️ Failed to create/find UnitOfMeasure for "${unit}"`);
      return false;
    }

    // Set as default for the item
    await setItemUnitOfMeasureAsDefault(item.id, matchingUnit.id);
    return true;
  } catch (error) {
    console.error(`⚠️ Failed to sync UM for item "${zohoItem?.name || 'unknown'}" (ID: ${item?.id}):`, error.message);
    return false;
  }
};
