import { TextractClient } from "@aws-sdk/client-textract";
import { makeHandler } from "./handler";

export const handler = makeHandler({
  textractClient: new TextractClient({}),
});
