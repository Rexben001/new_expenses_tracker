import { DbService } from "../../services/shared/dbService";
import { processMonthlyRecurringJob } from "../../services/recurring";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async () => {
    try {
      await processMonthlyRecurringJob(dbService);
    } catch (error) {
      console.error("Error in handler:", error);
    }
  };
};
