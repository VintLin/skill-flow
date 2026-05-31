import {
  buildBridgeResponse,
  parseBridgeRequest,
  type BridgeRequest,
} from "@skill-flow/shared-types/protocol";
import type { SkillFlowApp } from "@skill-flow/query/runtime";
import { executeBridgeRequest } from "./bridge-command.js";

export type BridgeCommandOptions = {
  json?: boolean;
  request?: string;
};

export type BridgeCommandIO = {
  stdin?: AsyncIterable<Buffer | string>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

export async function runBridgeCommand(
  app: SkillFlowApp,
  options: BridgeCommandOptions,
  io: BridgeCommandIO = {},
): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  if (!options.json) {
    stderr("bridge requires --json");
    return 2;
  }

  const requestInput = options.request ?? (await readStdin(io.stdin ?? process.stdin)).trim();
  if (!requestInput) {
    stdout(
      JSON.stringify(
        buildBridgeResponse({
          command: "list",
          ok: false,
          errors: [
            {
              code: "BRIDGE_EMPTY_REQUEST",
              message: "Bridge request payload is empty.",
            },
          ],
        }),
      ),
    );
    return 1;
  }

  let request: BridgeRequest;
  try {
    request = parseBridgeRequest(JSON.parse(requestInput));
  } catch (error) {
    stdout(
      JSON.stringify(
        buildBridgeResponse({
          command: "list",
          ok: false,
          errors: [
            {
              code: "BRIDGE_REQUEST_INVALID",
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        }),
      ),
    );
    return 1;
  }

  const response = await executeBridgeRequest(app, request);
  stdout(JSON.stringify(response));
  return response.ok ? 0 : 1;
}

export function parseBridgeProcessArgs(args: string[]): BridgeCommandOptions {
  const options: BridgeCommandOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--request") {
      options.request = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--request=")) {
      options.request = arg.slice("--request=".length);
    }
  }

  return options;
}

async function readStdin(stdin: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
