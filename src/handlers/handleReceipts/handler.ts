import type { APIGatewayEvent, Context } from "aws-lambda";
import { TextractClient } from "@aws-sdk/client-textract";
import { analyzeReceiptImage } from "../../services/receipts/analyzeReceipt";
import { getUserId } from "../../utils/getUserId";
import { HttpError } from "../../utils/http-error";
import { createInvocationLogger } from "../../utils/logger";
import { errorResponse, successResponse } from "../../utils/response";

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

type ScanReceiptBody = {
  imageBase64?: string;
  contentType?: string;
  fileName?: string;
};

export const makeHandler = ({
  textractClient,
}: {
  textractClient: TextractClient;
}) => {
  return async (event: APIGatewayEvent, context: Context) => {
    const logger = createInvocationLogger(context, {
      handler: "handleReceipts",
      path: event.path,
      method: event.httpMethod,
    });

    try {
      getUserId(event);

      if (event.httpMethod !== "POST") {
        throw new HttpError("Method not allowed", 405);
      }

      const body = parseBody(event.body);
      const imageBytes = decodeImage(body);

      logger.info("Scanning receipt with Textract", {
        contentType: body.contentType,
        fileName: body.fileName,
        imageBytes: imageBytes.byteLength,
      });

      const receipt = await analyzeReceiptImage({
        textractClient,
        imageBytes,
      });

      return successResponse(receipt);
    } catch (error) {
      logger.error("Error handling receipt scan request", { error });

      if (error instanceof HttpError) {
        return errorResponse(error.message, error.status);
      }

      return errorResponse("Receipt scan failed");
    }
  };
};

function parseBody(body: string | null): ScanReceiptBody {
  if (!body) throw new HttpError("Receipt image is required", 400);

  try {
    return JSON.parse(body) as ScanReceiptBody;
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

function decodeImage(body: ScanReceiptBody) {
  const base64 = body.imageBase64?.includes(",")
    ? body.imageBase64.split(",").pop()
    : body.imageBase64;

  if (!base64) throw new HttpError("Receipt image is required", 400);

  const imageBytes = Buffer.from(base64, "base64");

  if (!imageBytes.byteLength) {
    throw new HttpError("Receipt image is empty", 400);
  }

  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError("Receipt image is too large", 413);
  }

  return imageBytes;
}
