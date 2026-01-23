import { UnitOfMeasure } from '../models/index.js';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/responseHelper.js';

export const getUnits = async (req, res) => {
  try {
    const units = await UnitOfMeasure.findAll({
      order: [['unitName', 'ASC']]
    });

    return sendSuccess(res, { units });
  } catch (err) {
    console.error('Get units error:', err);
    return sendError(res, 'Failed to fetch units', 500, err);
  }
};

export const createUnit = async (req, res) => {
  try {
    const { unitName, symbol, unitPrecision } = req.body;

    if (!unitName || !symbol) {
      return sendValidationError(res, 'Unit name and symbol are required');
    }

    if (unitPrecision === undefined || unitPrecision === null) {
      return sendValidationError(res, 'Unit precision is required');
    }

    // Check if unit already exists
    const existingUnit = await UnitOfMeasure.findOne({
      where: { unitName }
    });

    if (existingUnit) {
      // Update existing unit if it exists
      await existingUnit.update({
        symbol,
        unitPrecision: parseInt(unitPrecision) || 0
      });
      return sendSuccess(res, { unit: existingUnit }, 'Unit of measure updated successfully');
    }

    // Create new unit if it doesn't exist
    const unit = await UnitOfMeasure.create({
      unitName,
      symbol,
      unitPrecision: parseInt(unitPrecision) || 0
    });

    return sendSuccess(res, { unit }, 'Unit of measure created successfully');
  } catch (err) {
    console.error('Create unit error:', err);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return sendError(res, `Unit name "${req.body.unitName}" already exists`, 400);
    }
    return sendError(res, 'Failed to create unit', 500, err);
  }
};

export const deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await UnitOfMeasure.findByPk(id);

    if (!unit) {
      return sendNotFound(res, 'Unit of measure');
    }

    await unit.destroy();

    return sendSuccess(res, {}, 'Unit of measure deleted successfully');
  } catch (err) {
    console.error('Delete unit error:', err);
    return sendError(res, 'Failed to delete unit', 500, err);
  }
};
