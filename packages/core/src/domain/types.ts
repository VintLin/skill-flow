export * from "@skill-flow/domain";

export type ImportSourceResult =
  | {
      status: "ready";
      sourceId: string;
      canonicalRepo: string;
    }
  | {
      status: "failed";
      reasonCode: string;
      retryable: boolean;
    };
