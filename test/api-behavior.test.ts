import type { APIGatewayEvent, Context } from "aws-lambda";
import { createTask } from "../src/services/tasks/createTask";
import { makeHandler as makeHowToHandler } from "../src/handlers/handleHowTo/handler";
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

function howToApiEvent({
  body = "",
  method,
  path,
  pathParameters = {},
  queryStringParameters = {},
}: {
  body?: string | null;
  method: string;
  path: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}) {
  return {
    body,
    httpMethod: method,
    path,
    pathParameters,
    queryStringParameters,
    requestContext: {
      authorizer: {
        claims: {
          sub: "admin-user",
          email: "rexben.rb@gmail.com",
        },
      },
    },
  } as unknown as APIGatewayEvent;
}

function makeHowToDbService() {
  const items = new Map<string, Record<string, any>>();
  const keyOf = (key: Record<string, any>) => `${key.PK}|${key.SK}`;
  const attrValue = (value: any) => value?.S ?? value;

  return {
    items,
    dbService: {
      putItem: jest.fn(async (item: Record<string, any>) => {
        items.set(keyOf(item), item);
      }),
      queryItems: jest.fn(async (_expression: string, values: Record<string, any>) => {
        const pk = attrValue(values[":pk"]);
        const sk = values[":sk"] ? attrValue(values[":sk"]) : undefined;
        const skPrefix = values[":skPrefix"]
          ? attrValue(values[":skPrefix"])
          : undefined;

        return Array.from(items.values()).filter((item) => {
          if (item.PK !== pk) return false;
          if (sk) return item.SK === sk;
          if (skPrefix) return item.SK.startsWith(skPrefix);
          return true;
        });
      }),
      updateItem: jest.fn(
        async (
          key: Record<string, any>,
          _updateExpression: string,
          expressionAttributeNames: Record<string, string>,
          expressionAttributeValues: Record<string, any>
        ) => {
          const current = items.get(keyOf(key));
          if (!current) throw new Error("missing item");
          const updated = { ...current };
          Object.entries(expressionAttributeNames).forEach(([alias, name]) => {
            const valueAlias = `:${alias.slice(1)}`;
            updated[name] = expressionAttributeValues[valueAlias];
          });
          items.set(keyOf(key), updated);
          return updated;
        }
      ),
      deleteItem: jest.fn(async (key: Record<string, any>) => {
        items.delete(keyOf(key));
      }),
    } as unknown as DbService,
  };
}

function makeHowToKmsClient() {
  return {
    send: jest.fn(async (command: any) => {
      const commandName = command.constructor.name;
      if (commandName === "EncryptCommand") {
        const plaintext = Buffer.from(command.input.Plaintext).toString("utf8");
        return { CiphertextBlob: Buffer.from(`encrypted:${plaintext}`) };
      }
      if (commandName === "DecryptCommand") {
        const ciphertext = Buffer.from(command.input.CiphertextBlob).toString("utf8");
        return { Plaintext: Buffer.from(ciphertext.replace(/^encrypted:/, "")) };
      }
      throw new Error(`Unexpected command ${commandName}`);
    }),
  };
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

  test("how-to items are searchable and hide encrypted secrets by default", async () => {
    const previousKeyId = process.env.HOW_TO_KMS_KEY_ID;
    process.env.HOW_TO_KMS_KEY_ID = "test-key";
    const { dbService } = makeHowToDbService();
    const kmsClient = makeHowToKmsClient();
    const handler = makeHowToHandler({ dbService, kmsClient } as any);

    const createResponse = await handler(
      howToApiEvent({
        method: "POST",
        path: "/how-to",
        body: JSON.stringify({
          title: "Car insurance",
          category: "Insurance",
          tags: ["car", "policy"],
          keywords: ["claim"],
          summary: "Renewal and claim notes",
          contentJson: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Call the broker for claims." }],
              },
            ],
          },
          loginDetails: {
            url: "https://insurer.example",
            email: "admin@example.com",
          },
          secrets: [{ label: "Password", value: "secret-pass" }],
        }),
      }),
      {} as Context
    );

    expect(createResponse.statusCode).toBe(201);
    const created = parseBody(createResponse).item;
    expect(created.hasSecrets).toBe(true);
    expect(created.secretLabels).toEqual([
      expect.objectContaining({ label: "Password" }),
    ]);
    expect(created.encryptedSecrets).toBeUndefined();
    expect(created.searchText).toBeUndefined();

    const listResponse = await handler(
      howToApiEvent({
        method: "GET",
        path: "/how-to",
        queryStringParameters: { query: "broker" },
      }),
      {} as Context
    );

    expect(listResponse.statusCode).toBe(200);
    const listBody = parseBody(listResponse);
    expect(listBody.total).toBe(1);
    expect(listBody.items[0]).toEqual(
      expect.objectContaining({
        title: "Car insurance",
        hasSecrets: true,
      })
    );
    expect(listBody.items[0].encryptedSecrets).toBeUndefined();

    const revealResponse = await handler(
      howToApiEvent({
        method: "GET",
        path: `/how-to/${created.id}/secrets`,
        pathParameters: { howToId: created.id },
      }),
      {} as Context
    );

    expect(revealResponse.statusCode).toBe(200);
    expect(parseBody(revealResponse).secrets).toEqual([
      expect.objectContaining({
        label: "Password",
        value: "secret-pass",
      }),
    ]);

    if (previousKeyId === undefined) delete process.env.HOW_TO_KMS_KEY_ID;
    else process.env.HOW_TO_KMS_KEY_ID = previousKeyId;
  });

  test("how-to updates preserve omitted secrets and clear explicit empty secrets", async () => {
    const previousKeyId = process.env.HOW_TO_KMS_KEY_ID;
    process.env.HOW_TO_KMS_KEY_ID = "test-key";
    const { dbService } = makeHowToDbService();
    const kmsClient = makeHowToKmsClient();
    const handler = makeHowToHandler({ dbService, kmsClient } as any);

    const created = parseBody(
      await handler(
        howToApiEvent({
          method: "POST",
          path: "/how-to",
          body: JSON.stringify({
            title: "Home insurance",
            secrets: [{ label: "PIN", value: "1234" }],
          }),
        }),
        {} as Context
      )
    ).item;

    await handler(
      howToApiEvent({
        method: "PUT",
        path: `/how-to/${created.id}`,
        pathParameters: { howToId: created.id },
        body: JSON.stringify({ title: "Updated home insurance" }),
      }),
      {} as Context
    );

    const preservedSecrets = parseBody(
      await handler(
        howToApiEvent({
          method: "GET",
          path: `/how-to/${created.id}/secrets`,
          pathParameters: { howToId: created.id },
        }),
        {} as Context
      )
    ).secrets;
    expect(preservedSecrets).toEqual([
      expect.objectContaining({ label: "PIN", value: "1234" }),
    ]);

    const clearResponse = await handler(
      howToApiEvent({
        method: "PUT",
        path: `/how-to/${created.id}`,
        pathParameters: { howToId: created.id },
        body: JSON.stringify({ secrets: [] }),
      }),
      {} as Context
    );

    expect(parseBody(clearResponse).item.hasSecrets).toBe(false);
    const clearedSecrets = parseBody(
      await handler(
        howToApiEvent({
          method: "GET",
          path: `/how-to/${created.id}/secrets`,
          pathParameters: { howToId: created.id },
        }),
        {} as Context
      )
    ).secrets;
    expect(clearedSecrets).toEqual([]);

    if (previousKeyId === undefined) delete process.env.HOW_TO_KMS_KEY_ID;
    else process.env.HOW_TO_KMS_KEY_ID = previousKeyId;
  });
});
