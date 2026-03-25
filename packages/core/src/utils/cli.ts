const GENERATED_DUPLICATE_WARNING =
  /^\.(?:agents|claude|codex|opencode|openclaw)\/skills\/.+: Duplicate skill content skipped because source\/skills\/.+ was discovered first$/;

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

export function filterAddWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !GENERATED_DUPLICATE_WARNING.test(warning));
}
