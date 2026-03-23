export function resolveAddSourceLocator(source: string, from?: string): string {
  const trimmedSource = source.trim();
  const trimmedFrom = from?.trim().toLowerCase();

  if (!trimmedFrom) {
    return trimmedSource;
  }

  if (trimmedFrom !== "clawhub") {
    throw new Error(`Unsupported source catalog '${from}'.`);
  }

  if (trimmedSource.startsWith("clawhub:")) {
    return trimmedSource;
  }

  return `clawhub:${trimmedSource}`;
}
