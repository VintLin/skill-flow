import { spawn } from "node:child_process";
import {
  type BridgeRequest,
  type BridgeResponse,
  type JsonObject,
  parseBridgeRequest,
} from "@skill-flow/shared-types/protocol";

export type BridgeClientOptions = {
  cliPath: string;
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export class BridgeClient {
  private readonly cliPath: string;
  private readonly timeoutMs: number;
  private readonly cwd: string | undefined;
  private readonly env: NodeJS.ProcessEnv | undefined;

  constructor(options: BridgeClientOptions) {
    this.cliPath = options.cliPath;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.cwd = options.cwd;
    this.env = options.env;
  }

  execute(request: BridgeRequest): Promise<BridgeResponse> {
    return new Promise<BridgeResponse>((resolve, reject) => {
      const child = spawn(process.execPath, [this.cliPath, "bridge", "--json"], {
        cwd: this.cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const input = JSON.stringify(request);
      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Bridge request timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.once("close", (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(
            new Error(
              `Bridge helper exited with code ${code}. stderr: ${stderr || "<empty>"}`,
            ),
          );
          return;
        }

        let parsedJson: JsonObject;
        try {
          parsedJson = JSON.parse(stdout) as JsonObject;
        } catch (error) {
          reject(
            new Error(
              `Bridge helper returned invalid JSON: ${String(error)}. stdout: ${stdout || "<empty>"}`,
            ),
          );
          return;
        }

        try {
          const response = parseBridgeResponse(parsedJson);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      child.stdin.write(input);
      child.stdin.end();
    });
  }
}

function parseBridgeResponse(input: unknown): BridgeResponse {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Bridge response must be a JSON object.");
  }
  const candidate = input as Record<string, unknown>;
  const parsedRequest = parseBridgeRequest({
    protocolVersion: candidate.protocolVersion,
    command: candidate.command,
    requestId: candidate.requestId,
    payload: candidate.data,
  });

  if (typeof candidate.ok !== "boolean") {
    throw new Error("Bridge response requires boolean 'ok'.");
  }

  const warnings = parseErrorArray(candidate.warnings, "warnings");
  const errors = parseErrorArray(candidate.errors, "errors");

  return {
    protocolVersion: parsedRequest.protocolVersion,
    command: parsedRequest.command,
    ...(parsedRequest.requestId ? { requestId: parsedRequest.requestId } : {}),
    ok: candidate.ok,
    ...(parsedRequest.payload !== undefined ? { data: parsedRequest.payload } : {}),
    warnings,
    errors,
  };
}

function parseErrorArray(value: unknown, field: string): Array<{ code: string; message: string }> {
  if (!Array.isArray(value)) {
    throw new Error(`Bridge response '${field}' must be an array.`);
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Bridge response '${field}' contains invalid entry.`);
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.code !== "string" || typeof candidate.message !== "string") {
      throw new Error(`Bridge response '${field}' entry must include string code/message.`);
    }
    return { code: candidate.code, message: candidate.message };
  });
}
