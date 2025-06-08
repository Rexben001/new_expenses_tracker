export const formatDbItem = (
  item: Record<string, any>
): Record<string, any> => {
  const { PK, SK, ...rest } = item;
  return rest;
};
