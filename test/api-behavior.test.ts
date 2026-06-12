import { createTask } from "../src/services/tasks/createTask";
import { getExpenses } from "../src/services/expenses/getExpenses";
import type { DbService } from "../src/services/shared/dbService";
import { getTasks } from "../src/services/tasks/getTasks";
import { updateTask } from "../src/services/tasks/updateTask";
import { HttpError } from "../src/utils/http-error";
import { errorResponseFromError } from "../src/utils/response";

function makeDbService(items: Record<string, any>[] = []) {
  return {
    putItem: jest.fn().mockResolvedValue(undefined),
    queryItems: jest.fn().mockResolvedValue(items),
    updateItem: jest.fn().mockResolvedValue({}),
  } as unknown as DbService;
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

describe("API response behavior", () => {
  test("task list requests return an empty array when there are no tasks", async () => {
    const dbService = makeDbService();

    const response = await getTasks({
      dbService,
      userId: "user-1",
    });

    expect(response.statusCode).toBe(200);
    expect(parseBody(response)).toEqual([]);
  });

  test("single task requests still return 404 when the task is missing", async () => {
    const dbService = makeDbService();

    const response = await getTasks({
      dbService,
      userId: "user-1",
      taskId: "task-1",
    });

    expect(response.statusCode).toBe(404);
    expect(parseBody(response)).toEqual({
      message: "No tasks found for the given criteria",
      statusCode: 404,
    });
  });

  test("task creation stores the assigned person", async () => {
    const dbService = makeDbService();

    const response = await createTask({
      dbService,
      userId: "user-1",
      body: JSON.stringify({
        assignedTo: "Ada",
        title: "Prepare braiding hair",
        updatedAt: "2026-06-11T10:00:00.000Z",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(dbService.putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: "Ada",
        title: "Prepare braiding hair",
      })
    );
  });

  test("task updates can change the assigned person", async () => {
    const dbService = makeDbService();
    (dbService.updateItem as jest.Mock).mockResolvedValue({
      assignedTo: "Tola",
      id: "task-1",
      title: "Prepare braiding hair",
      updatedAt: "2026-06-11T10:00:00.000Z",
    });

    const response = await updateTask({
      dbService,
      userId: "user-1",
      taskId: "task-1",
      body: JSON.stringify({
        assignedTo: "Tola",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(dbService.updateItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("#assignedTo = :assignedTo"),
      expect.objectContaining({
        "#assignedTo": "assignedTo",
      }),
      expect.objectContaining({
        ":assignedTo": "Tola",
      })
    );
    expect(parseBody(response).item.assignedTo).toBe("Tola");
  });

  test("expense list requests return an empty array when there are no expenses", async () => {
    const dbService = makeDbService();

    const response = await getExpenses({
      dbService,
      userId: "user-1",
    });

    expect(response.statusCode).toBe(200);
    expect(parseBody(response)).toEqual([]);
  });

  test("single expense requests still return 404 when the expense is missing", async () => {
    const dbService = makeDbService();

    const response = await getExpenses({
      dbService,
      userId: "user-1",
      expenseId: "expense-1",
    });

    expect(response.statusCode).toBe(404);
    expect(parseBody(response)).toEqual({
      message: "No expenses found for the given criteria",
      statusCode: 404,
    });
  });

  test("HttpError responses preserve the intended status code", () => {
    const response = errorResponseFromError(new HttpError("Bad request", 400));

    expect(response.statusCode).toBe(400);
    expect(parseBody(response)).toEqual({
      message: "Bad request",
      statusCode: 400,
    });
  });
});
