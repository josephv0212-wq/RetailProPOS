import { Item, UnitOfMeasure, ItemUnitOfMeasure } from '../models/index.js';
import { Op } from 'sequelize';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

export const getItemUnits = async (req, res) => {
  try {
    const { itemId } = req.params;

    let item;
    try {
      // Try with basicUM attribute first
      item = await Item.findByPk(itemId, {
        include: [{
          model: UnitOfMeasure,
          as: 'unitOfMeasures',
          attributes: ['id', 'unitName', 'symbol', 'unitPrecision', 'basicUM'],
          through: { attributes: ['isDefault'] }
        }]
      });
    } catch (attrError) {
      // If basicUM column doesn't exist yet, retry without it
      if (attrError.message?.includes('basicUM') || attrError.original?.message?.includes('basicUM')) {
        item = await Item.findByPk(itemId, {
          include: [{
            model: UnitOfMeasure,
            as: 'unitOfMeasures',
            attributes: ['id', 'unitName', 'symbol', 'unitPrecision'],
            through: { attributes: ['isDefault'] }
          }]
        });
      } else {
        throw attrError;
      }
    }

    if (!item) {
      return sendNotFound(res, 'Item');
    }

    let units = item.unitOfMeasures || [];
    let needsReload = false;

    // Ensure the default UM (from Items.unit) is always included
    // If Items.unit exists but isn't in the relationship table, find or create it
    if (item.unit) {
      const defaultUnitInList = units.find(u => {
        const unitText = u.symbol || u.unitName;
        return unitText === item.unit;
      });

      // If default unit is not in the list, try to find it in UnitOfMeasure table
      if (!defaultUnitInList) {
        const defaultUnit = await UnitOfMeasure.findOne({
          where: {
            [Op.or]: [
              { symbol: item.unit },
              { unitName: item.unit }
            ]
          }
        });

        if (defaultUnit) {
          // Create the relationship if it doesn't exist
          const existingRelation = await ItemUnitOfMeasure.findOne({
            where: { itemId: item.id, unitOfMeasureId: defaultUnit.id }
          });

          if (!existingRelation) {
            await ItemUnitOfMeasure.create({
              itemId: item.id,
              unitOfMeasureId: defaultUnit.id,
              isDefault: true
            });
            needsReload = true;
          } else if (!existingRelation.isDefault) {
            // Update existing relation to be default
            await existingRelation.update({ isDefault: true });
            // Unset other defaults
            await ItemUnitOfMeasure.update(
              { isDefault: false },
              { 
                where: { 
                  itemId: item.id,
                  unitOfMeasureId: { [Op.ne]: defaultUnit.id }
                }
              }
            );
            needsReload = true;
          }
        }
      } else {
        // Ensure the default unit has isDefault flag set correctly
        if (!defaultUnitInList.ItemUnitOfMeasure?.isDefault) {
          // Update the relationship to set isDefault
          await ItemUnitOfMeasure.update(
            { isDefault: true },
            { where: { itemId: item.id, unitOfMeasureId: defaultUnitInList.id } }
          );
          // Unset other defaults
          await ItemUnitOfMeasure.update(
            { isDefault: false },
            { 
              where: { 
                itemId: item.id,
                unitOfMeasureId: { [Op.ne]: defaultUnitInList.id }
              }
            }
          );
          needsReload = true;
        }
      }
    }

    // Reload item with relationships if we made changes
    if (needsReload) {
      let reloadedItem;
      try {
        reloadedItem = await Item.findByPk(itemId, {
          include: [{
            model: UnitOfMeasure,
            as: 'unitOfMeasures',
            attributes: ['id', 'unitName', 'symbol', 'unitPrecision', 'basicUM'],
            through: { attributes: ['isDefault'] }
          }]
        });
      } catch (attrError) {
        // If basicUM column doesn't exist yet, retry without it
        if (attrError.message?.includes('basicUM') || attrError.original?.message?.includes('basicUM')) {
          reloadedItem = await Item.findByPk(itemId, {
            include: [{
              model: UnitOfMeasure,
              as: 'unitOfMeasures',
              attributes: ['id', 'unitName', 'symbol', 'unitPrecision'],
              through: { attributes: ['isDefault'] }
            }]
          });
        } else {
          throw attrError;
        }
      }
      units = reloadedItem?.unitOfMeasures || units;
    }

    return sendSuccess(res, { units });
  } catch (err) {
    console.error('Get item units error:', err);
    return sendError(res, 'Failed to fetch item units', 500, err);
  }
};

export const addItemUnit = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { unitOfMeasureId } = req.body;

    if (!unitOfMeasureId) {
      return sendValidationError(res, 'Unit of measure ID is required');
    }

    const item = await Item.findByPk(itemId);
    if (!item) {
      return sendNotFound(res, 'Item');
    }

    const unit = await UnitOfMeasure.findByPk(unitOfMeasureId);
    if (!unit) {
      return sendNotFound(res, 'Unit of measure');
    }

    // Validation: Admin can only add UM to item if item's default UM matches the UM's basicUM
    if (!unit.basicUM) {
      return sendError(res, 'Cannot add Zoho-synced units to items. Only user-created units with a basic UM can be added.', 400);
    }

    // Get the item's default UM (from Items.unit field or from ItemUnitOfMeasure with isDefault=true)
    let itemDefaultUM = item.unit;
    if (!itemDefaultUM) {
      const defaultItemUnit = await ItemUnitOfMeasure.findOne({
        where: { itemId, isDefault: true }
      });
      if (defaultItemUnit) {
        const defaultUnit = await UnitOfMeasure.findByPk(defaultItemUnit.unitOfMeasureId);
        if (defaultUnit) {
          itemDefaultUM = defaultUnit.symbol || defaultUnit.unitName;
        }
      }
    }

    // Check if item's default UM matches the UM's basicUM
    if (!itemDefaultUM || itemDefaultUM !== unit.basicUM) {
      return sendError(res, `Cannot add this unit to the item. The item's default unit (${itemDefaultUM || 'none'}) must match the unit's basic UM (${unit.basicUM}).`, 400);
    }

    // Check if relationship already exists
    const existing = await ItemUnitOfMeasure.findOne({
      where: { itemId, unitOfMeasureId }
    });

    if (existing) {
      return sendError(res, 'Unit of measure already assigned to this item', 400);
    }

    // User-created units are never default (default comes from Zoho)
    await ItemUnitOfMeasure.create({
      itemId,
      unitOfMeasureId,
      isDefault: false
    });

    return sendSuccess(res, {}, 'Unit of measure added to item successfully');
  } catch (err) {
    console.error('Add item unit error:', err);
    return sendError(res, 'Failed to add unit to item', 500, err);
  }
};

export const removeItemUnit = async (req, res) => {
  try {
    const { itemId, unitOfMeasureId } = req.params;

    const item = await Item.findByPk(itemId);
    if (!item) {
      return sendNotFound(res, 'Item');
    }

    const itemUnit = await ItemUnitOfMeasure.findOne({
      where: { itemId, unitOfMeasureId }
    });

    if (!itemUnit) {
      return sendNotFound(res, 'Item unit of measure relationship');
    }

    // Prevent removal of the default unit (which comes from Zoho)
    if (itemUnit.isDefault) {
      return sendError(res, 'Cannot remove the default unit. It is set from Zoho sync based on the item\'s unit field.', 403);
    }

    await itemUnit.destroy();

    return sendSuccess(res, {}, 'Unit of measure removed from item successfully');
  } catch (err) {
    console.error('Remove item unit error:', err);
    return sendError(res, 'Failed to remove unit from item', 500, err);
  }
};

export const setDefaultUnit = async (req, res) => {
  try {
    // Default UM is managed by Zoho sync (Items.unit field), admins cannot change it
    return sendError(res, 'Default unit cannot be changed. It is set from Zoho sync based on the item\'s unit field.', 403);
  } catch (err) {
    console.error('Set default unit error:', err);
    return sendError(res, 'Failed to set default unit', 500, err);
  }
};
