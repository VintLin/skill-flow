export function buildFindCommand(candidate) {
    if (candidate.action.type === "none") {
        return null;
    }
    if (candidate.action.type === "add-clawhub") {
        const suffix = candidate.action.version ? `@${candidate.action.version}` : "";
        return `skill-flow add clawhub:${candidate.action.slug}${suffix}`;
    }
    const parts = ["skill-flow", "add", shellQuote(candidate.action.locator)];
    const requestedPath = normalizeRequestedPath(candidate.action.requestedPath);
    if (requestedPath) {
        parts.push("--path", shellQuote(requestedPath));
    }
    return parts.join(" ");
}
function normalizeRequestedPath(requestedPath) {
    if (!requestedPath) {
        return undefined;
    }
    const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 && normalized !== "." ? normalized : undefined;
}
function shellQuote(value) {
    if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
//# sourceMappingURL=find-command.js.map