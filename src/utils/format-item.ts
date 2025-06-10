export const formatDbItem = (
  item: Record<string, any>
): Record<string, any> => {
  const { PK, SK, gsiPk, gsiSk, ...rest } = item;
  return rest;
};
