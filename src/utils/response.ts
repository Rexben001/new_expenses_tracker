const headers = {
  "Access-Control-Allow-Origin": "*", // or your frontend URL
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
};

export const successResponse = (body: any, statusCode = 200) => {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
};

export const errorResponse = (
  message = "Internal Server Error",
  statusCode = 500
) => {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ message }),
  };
};
