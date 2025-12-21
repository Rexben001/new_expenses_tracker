import { randomUUID } from "node:crypto";
import {
  DurableExecutionHandler,
  withDurableExecution,
} from "@aws/durable-execution-sdk-js";

type CreateOrderInput = {
  userId: string;
  subAccountId?: string;
  order?: Record<string, unknown>;
  notificationTarget?: string;
};

type CreateOrderResult = {
  orderId: string;
  userId: string;
  createdAt: string;
  notificationTarget?: string;
};

export const makeHandler = () => {
  const durableHandler: DurableExecutionHandler<
    CreateOrderInput,
    CreateOrderResult
  > = async (event, context) => {
    if (!event?.userId) {
      throw new Error("userId is required to create an order");
    }

    const createdAt = new Date().toISOString();
    const orderId = randomUUID();

    await context.step("create-order", async (stepContext) => {
      stepContext.logger.info("Creating order", {
        orderId,
        userId: event.userId,
      });
      console.log("first step completed");
    });

    await context.wait("wait-before-notify", { minutes: 5 });

    await context.step("send-notification", async (stepContext) => {
      stepContext.logger.info("Sending order notification", {
        orderId,
        userId: event.userId,
      });
      console.log("Sent the order notification");
    });

    return {
      orderId,
      userId: event.userId,
      createdAt,
      notificationTarget: event.notificationTarget,
    };
  };

  return withDurableExecution(durableHandler);
};
