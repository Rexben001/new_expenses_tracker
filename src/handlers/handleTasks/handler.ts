import type { APIGatewayEvent, Context } from "aws-lambda";
import { createTask } from "../../services/tasks/createTask";
import { deleteTask } from "../../services/tasks/deleteTask";
import { getTasks } from "../../services/tasks/getTasks";
import { updateTask } from "../../services/tasks/updateTask";
import { DbService } from "../../services/shared/dbService";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponse } from "../../utils/response";

export const makeHandler = ({ dbService }: { dbService: DbService }) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleTasks",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      const eventMethod = event.httpMethod;
      const userId = getUserId(event);
      const taskId = event.pathParameters?.taskId;
      const subAccountId = event.queryStringParameters?.subId;
      const body = event.body ?? "";

      logger.info("Received task request", {
        taskId,
        subAccountId,
        hasBody: body.length > 0,
      });

      if (!userId) {
        throw new HttpError("User ID is required", 400, {
          cause: new Error("User ID is missing from path parameters"),
        });
      }

      switch (eventMethod) {
        case "POST":
          return await createTask({
            dbService,
            body,
            userId,
            subAccountId,
          });
        case "GET":
          return await getTasks({
            dbService,
            userId,
            taskId,
            subAccountId,
          });
        case "PUT":
          return await updateTask({
            dbService,
            body,
            userId,
            taskId,
            subAccountId,
          });
        case "DELETE":
          return await deleteTask({
            dbService,
            userId,
            taskId,
            subAccountId,
          });
        default:
          throw new HttpError("Method not allowed", 405, {
            cause: new Error(`Method ${eventMethod} is not allowed`),
          });
      }
    } catch (error) {
      logger.error("Error handling task request", { error });
      return errorResponse();
    }
  };
};
