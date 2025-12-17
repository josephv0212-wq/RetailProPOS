export const normalizeContactType = (value) => {
  if (!value) return null;
  return value.toString().trim().toLowerCase();
};

export const isVendorContact = (value) => normalizeContactType(value) === 'vendor';

