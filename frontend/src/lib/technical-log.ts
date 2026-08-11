type MaybeNextDynamicError = {
  digest?: unknown;
};

export function logTechnicalError(message: string, error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    (error as MaybeNextDynamicError).digest === "DYNAMIC_SERVER_USAGE"
  ) {
    return;
  }

  console.error(message, error);
}
