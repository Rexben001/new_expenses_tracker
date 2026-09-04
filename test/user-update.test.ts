import type { DbService } from "../src/services/shared/dbService";
import { updateUser } from "../src/services/users/updateUser";

describe("user profile updates", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  test("does not let clients grant themselves calendar access", async () => {
    const updateItem = jest.fn().mockResolvedValue({
      PK: `USER#${userId}`,
      SK: `PROFILE#${userId}`,
      userName: "Updated",
    });
    const dbService = { updateItem } as unknown as DbService;

    await updateUser({
      dbService,
      userId,
      body: JSON.stringify({ userName: "Updated", calendarEnabled: true }),
    });

    expect(updateItem).toHaveBeenCalledWith(
      expect.anything(),
      "SET #userName = :userName",
      { "#userName": "userName" },
      { ":userName": "Updated" }
    );
  });

  test("rejects a profile update containing only protected fields", async () => {
    const dbService = { updateItem: jest.fn() } as unknown as DbService;

    await expect(
      updateUser({
        dbService,
        userId,
        body: JSON.stringify({ calendarEnabled: true }),
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(dbService.updateItem).not.toHaveBeenCalled();
  });
});
