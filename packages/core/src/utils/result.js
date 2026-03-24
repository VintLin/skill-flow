export function ok(data, warnings = []) {
    return { ok: true, data, warnings, errors: [] };
}
export function fail(errors, warnings = [], data) {
    const base = {
        ok: false,
        warnings,
        errors: Array.isArray(errors) ? errors : [errors],
    };
    return data === undefined ? base : { ...base, data };
}
export function mergeWarnings(...warningSets) {
    return warningSets.flat();
}
//# sourceMappingURL=result.js.map