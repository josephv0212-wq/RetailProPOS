export const normalizeContactType = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.toString().trim().toLowerCase();
};

export const isVendorContact = (value: string | null | undefined): boolean => {
  return normalizeContactType(value) === 'vendor';
};
