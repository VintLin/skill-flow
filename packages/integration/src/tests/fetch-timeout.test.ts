import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS,
  DEFAULT_PROVIDER_FETCH_TIMEOUT_MS,
  FetchTimeoutError,
  fetchWithTimeout,
} from "../utils/fetch-timeout.js";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("returns a successful response before timeout", async () => {
    vi.useFakeTimers();
    const response = new Response("ok", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(
      fetchWithTimeout("https://example.com/skills", {}, { timeoutMs: 50 }),
    ).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("aborts a request after configured timeout with FetchTimeoutError details", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });
    });

    const request = fetchWithTimeout(
      "https://example.com/slow",
      {},
      { timeoutMs: 25 },
    );
    const assertion = expect(request).rejects.toMatchObject({
      name: "FetchTimeoutError",
      code: "FETCH_TIMEOUT",
      timeoutMs: 25,
      url: "https://example.com/slow",
    });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("aborts a response body read after configured timeout", async () => {
    vi.useFakeTimers();
    const response = {
      text: vi.fn(() => new Promise<string>(() => {})),
    } as unknown as Response;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const fetched = await fetchWithTimeout(
      "https://example.com/slow-body",
      {},
      { timeoutMs: 25 },
    );
    const assertion = expect(fetched.text()).rejects.toMatchObject({
      name: "FetchTimeoutError",
      code: "FETCH_TIMEOUT",
      timeoutMs: 25,
      url: "https://example.com/slow-body",
    });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("throws an already aborted Request signal reason", async () => {
    const requestController = new AbortController();
    const requestReason = new Error("request already canceled");
    requestController.abort(requestReason);
    const request = new Request("https://example.com/already-aborted", {
      signal: requestController.signal,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unexpected"));

    await expect(fetchWithTimeout(request)).rejects.toBe(requestReason);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("preserves Request signal aborts while a request is pending", async () => {
    vi.useFakeTimers();
    const requestController = new AbortController();
    const requestReason = new Error("request canceled");
    const request = new Request("https://example.com/request-abort", {
      signal: requestController.signal,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });
    });

    const pending = fetchWithTimeout(request, {}, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toBe(requestReason);
    requestController.abort(requestReason);
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("preserves existing caller abort signal", async () => {
    vi.useFakeTimers();
    const callerController = new AbortController();
    const callerReason = new Error("caller canceled");
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });
    });

    const request = fetchWithTimeout(
      "https://example.com/caller-abort",
      { signal: callerController.signal },
      { timeoutMs: 100 },
    );
    const assertion = expect(request).rejects.toBe(callerReason);
    callerController.abort(callerReason);
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });

  test("exports the default provider timeout and a timeout message containing timed out", () => {
    const error = new FetchTimeoutError("https://example.com/default", 60_000);

    expect(DEFAULT_PROVIDER_FETCH_TIMEOUT_MS).toBe(60_000);
    expect(DEFAULT_ARCHIVE_FETCH_TIMEOUT_MS).toBe(300_000);
    expect(error.message).toContain("timed out");
  });
});
