import {
  DurableExecutionHandler,
  withDurableExecution,
} from "@aws/durable-execution-sdk-js";

type CartReminderInput = {
  userId: string;
  cartId: string;
  email: string;
};

type CartReminderResult = {
  cartId: string;
  userId: string;
  reminderSent: boolean;
  timestamp: string;
};

export const makeHandler = () => {
  const durableHandler: DurableExecutionHandler<
    CartReminderInput,
    CartReminderResult
  > = async (event, context) => {
    const { cartId, userId, email } = event;
    const startTime = new Date().toISOString();

    await context.step("cart-added", async () => {
      console.log(`User ${userId} added cart ${cartId} at ${startTime}`);
    });

    // Wait 24 hours before checking cart status
    await context.wait("wait-before-reminder", { hours: 24 });

    // Check if cart was already checked out (mocked logic)
    const cartCheckedOut = false; // Simulate lookup

    if (!cartCheckedOut) {
      await context.step("send-reminder", async (stepContext) => {
        stepContext.logger.info("Sending cart reminder", {
          userId,
          cartId,
          email,
        });
      });

      return {
        cartId,
        userId,
        email,
        reminderSent: true,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      cartId,
      userId,
      email,
      reminderSent: false,
      timestamp: new Date().toISOString(),
    };
  };

  return withDurableExecution(durableHandler);
};
