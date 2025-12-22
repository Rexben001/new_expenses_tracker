import { LocalDurableTestRunner } from "@aws/durable-execution-sdk-js-testing";
import { handler } from "../src/handlers/cartReminder";

describe("cartReminder handler", () => {
  beforeAll(async () => {
    await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });
  });

  afterAll(async () => {
    await LocalDurableTestRunner.teardownTestEnvironment();
  });

  it("sends a reminder after the wait when the cart is not checked out", async () => {
    const runner = new LocalDurableTestRunner({
      handlerFunction: handler,
    });

    const execution = await runner.run({
      payload: {
        userId: "user-123",
        cartId: "cart-456",
        email: "user@example.com",
      },
    });

    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toMatchObject({
      userId: "user-123",
      cartId: "cart-456",
      email: "user@example.com",
      reminderSent: true,
      timestamp: expect.any(String),
    });
  });
});
