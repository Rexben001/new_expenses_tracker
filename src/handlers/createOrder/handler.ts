import { randomUUID } from "node:crypto";
import {
  DurableExecutionHandler,
  withDurableExecution,
} from "@aws/durable-execution-sdk-js";

type CreateOrderInput = {
  order?: Record<string, unknown>;
};

type CreateOrderResult = {
  orderId: string;
  createdAt: string;
};

export const makeHandler = () => {
  const durableHandler: DurableExecutionHandler<
    CreateOrderInput,
    CreateOrderResult
  > = async (event, context) => {
    const createdAt = new Date().toISOString();
    const orderId = randomUUID();

    await context.step("create-order", async (stepContext) => {
      stepContext.logger.info("Creating order", {
        orderId,
      });
      console.log("first step completed");
    });

    await context.wait("wait-before-notify", { minutes: 5 });

    await context.step("send-notification", async (stepContext) => {
      stepContext.logger.info("Sending order notification", {
        orderId,
      });
      console.log("Sent the order notification");
    });

    return {
      orderId,
      createdAt,
    };
  };

  return withDurableExecution(durableHandler);
};
