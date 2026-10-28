import builtinSourceCatalog from "../data/builtin-sources.json" with { type: "json" };

export type BuiltinGitSource = {
  locator: string;
  branch: string;
  path?: string;
};

export function getBuiltinGitSources(): BuiltinGitSource[] {
  return builtinSourceCatalog.map((source) => ({
    locator: source.locator,
    branch: source.branch,
    ...(source.path ? { path: source.path } : {}),
  }));
}
