import type { Context } from "aws-lambda";
import { DbService } from "../../services/shared/dbService";
import { processMonthlyRecurringJob } from "../../services/recurring";
import { createInvocationLogger } from "../../utils/logger";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (_event: unknown, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleRecurring",
    });

    try {
      logger.info("Starting monthly recurring job");
      await processMonthlyRecurringJob(dbService);
      logger.info("Monthly recurring job completed");
    } catch (error) {
      logger.error("Error in recurring job handler", { error });
    }
  };
};
