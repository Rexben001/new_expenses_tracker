import { Logger } from "@aws-lambda-powertools/logger";
import type { Context } from "aws-lambda";

const serviceName = process.env.POWERTOOLS_SERVICE_NAME ?? "expenses-be";

export const logger = new Logger({
  serviceName,
});

export const createInvocationLogger = (
  context?: Context,
  persistentKeys?: Record<string, unknown>
) => {
  const invocationLogger = logger.createChild({
    persistentKeys,
  });

  if (context) {
    invocationLogger.addContext(context);
  }

  return invocationLogger;
};
