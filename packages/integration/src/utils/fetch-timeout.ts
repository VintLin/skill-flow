/** Default for provider metadata/search. Large archive downloads should pass a longer timeoutMs. */
export const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = 60_000;

/** Budget for skill-group archive downloads and other large body transfers. */
export const DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS = 300_000;

/** Transient network attempts for archive / clone fallbacks. */
export const DEFAULT_NETWORK_RETRY_ATTEMPTS = 3;

export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof FetchTimeoutError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code?.toLowerCase();
  // Explicit non-retryable client failures (missing branch, auth, etc.).
  if (code === "http_client_error") {
    return false;
  }
  const message = error.message.toLowerCase();
  if (
    message.includes("timed out")
    || message.includes("timeout")
    || message.includes("econnreset")
    || message.includes("econnrefused")
    || message.includes("enotfound")
    || message.includes("eai_again")
    || message.includes("socket hang up")
    || message.includes("network")
    || message.includes("fetch failed")
    || message.includes("temporarily unavailable")
    || message.includes(" 429")
    || message.includes("status 429")
    || message.includes(" 502")
    || message.includes("status 502")
    || message.includes(" 503")
    || message.includes("status 503")
    || message.includes(" 504")
    || message.includes("status 504")
  ) {
    return true;
  }
  return code === "econnreset"
    || code === "econnrefused"
    || code === "enotfound"
    || code === "eai_again"
    || code === "etimedout"
    || code === "und_err_connect_timeout"
    || code === "und_err_headers_timeout"
    || code === "und_err_body_timeout";
}

export async function withNetworkRetries<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_NETWORK_RETRY_ATTEMPTS);
  const baseDelayMs = options.baseDelayMs ?? 400;
  const shouldRetry = options.shouldRetry ?? isTransientNetworkError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error;
      }
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type FetchTimeoutOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export class FetchTimeoutError extends Error {
  readonly code = "FETCH_TIMEOUT";
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, message?: string) {
    super(message ?? `Request to ${url} timed out after ${timeoutMs}ms.`);
    this.name = "FetchTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, FetchTimeoutError.prototype);
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {},
): Promise<Response> {
  const callerSignal = init.signal ?? undefined;
  const requestSignal = getRequestSignal(input);
  const abortSignals = collectAbortSignals(requestSignal, callerSignal);
  const abortedSignal = abortSignals.find((signal) => signal.aborted);

  const url = describeFetchInput(input);
  if (abortedSignal !== undefined) {
    throw getAbortReason(abortedSignal);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_FETCH_TIMEOUT_MS;
  const timeoutError = new FetchTimeoutError(
    url,
    timeoutMs,
    options.timeoutMessage,
  );
  const controller = new AbortController();
  const abortHandlers = abortSignals.map((signal) => {
    const handler = () => {
      controller.abort(getAbortReason(signal));
    };
    signal.addEventListener("abort", handler, { once: true });
    return { signal, handler };
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<Response>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });

    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
    return withBodyTimeout(response, {
      abortSignals,
      controller,
      timeoutError,
      timeoutMs,
    });
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    for (const { signal, handler } of abortHandlers) {
      signal.removeEventListener("abort", handler);
    }
  }
}

type BodyTimeoutContext = {
  abortSignals: AbortSignal[];
  controller: AbortController;
  timeoutError: FetchTimeoutError;
  timeoutMs: number;
};

function withBodyTimeout(response: Response, context: BodyTimeoutContext): Response {
  const bodyReaders = [
    "arrayBuffer",
    "blob",
    "formData",
    "json",
    "text",
  ] as const;
  const wrapped = response as Response & Record<(typeof bodyReaders)[number], (...args: unknown[]) => Promise<unknown>>;

  for (const method of bodyReaders) {
    const original = wrapped[method];
    if (typeof original !== "function") {
      continue;
    }

    Object.defineProperty(wrapped, method, {
      configurable: true,
      value: (...args: unknown[]) => {
        return readBodyWithTimeout(
          () => original.apply(response, args),
          context,
        );
      },
    });
  }

  return response;
}

async function readBodyWithTimeout<T>(
  read: () => Promise<T>,
  context: BodyTimeoutContext,
): Promise<T> {
  const abortedSignal = context.abortSignals.find((signal) => signal.aborted);
  if (abortedSignal !== undefined) {
    throw getAbortReason(abortedSignal);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortHandlers: Array<{ signal: AbortSignal; handler: () => void }> = [];
  const abortPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      context.controller.abort(context.timeoutError);
      reject(context.timeoutError);
    }, context.timeoutMs);

    for (const signal of context.abortSignals) {
      const handler = () => {
        const reason = getAbortReason(signal);
        context.controller.abort(reason);
        reject(reason);
      };
      signal.addEventListener("abort", handler, { once: true });
      abortHandlers.push({ signal, handler });
    }
  });

  try {
    return await Promise.race([read(), abortPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    for (const { signal, handler } of abortHandlers) {
      signal.removeEventListener("abort", handler);
    }
  }
}

function describeFetchInput(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new Error("Fetch request was aborted.");
}

function getRequestSignal(input: string | URL | Request): AbortSignal | undefined {
  if (typeof input === "string" || input instanceof URL) {
    return undefined;
  }
  return input.signal;
}

function collectAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal[] {
  return signals.filter((signal, index): signal is AbortSignal => {
    return signal !== undefined && signals.indexOf(signal) === index;
  });
}
