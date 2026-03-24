import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { AddFlowApp } from "./add-flow.js";
import { buildFindCommand } from "@skill-flow/core/utils/find-command.js";
export function FindApp({ app, query, candidates }) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const [loadedCandidates, setLoadedCandidates] = useState(candidates);
    const [loadError, setLoadError] = useState();
    const [loadWarnings, setLoadWarnings] = useState([]);
    const [cursor, setCursor] = useState(0);
    const [state, setState] = useState({ phase: "list" });
    const visibleCandidates = useMemo(() => (loadedCandidates ?? []).slice(0, 30), [loadedCandidates]);
    const selected = visibleCandidates[cursor];
    const columns = getColumns(stdout?.columns ?? 100);
    useEffect(() => {
        if (candidates) {
            setLoadedCandidates(candidates);
            return;
        }
        let cancelled = false;
        void app.findSkills(query).then((result) => {
            if (cancelled) {
                return;
            }
            if (!result.ok) {
                setLoadError(result.errors[0]?.message ?? "Search failed.");
                return;
            }
            setLoadedCandidates(result.data.candidates);
            setLoadWarnings(result.warnings.map((warning) => warning.message));
        });
        return () => {
            cancelled = true;
        };
    }, [app, candidates, query]);
    useInput((input, key) => {
        if (key.escape || input === "q") {
            if (state.phase === "confirm" || state.phase === "error") {
                setState({ phase: "list" });
                return;
            }
            exit();
            return;
        }
        if (state.phase === "installing") {
            return;
        }
        if (state.phase === "done") {
            exit();
            return;
        }
        if (key.upArrow) {
            setCursor((current) => Math.max(0, current - 1));
            return;
        }
        if (key.downArrow) {
            setCursor((current) => Math.min(visibleCandidates.length - 1, current + 1));
            return;
        }
        if (!key.return) {
            return;
        }
        if (!selected) {
            exit();
            return;
        }
        if (state.phase === "list") {
            setState({ phase: "confirm" });
            return;
        }
        if (state.phase === "confirm") {
            if (selected.action.type === "none") {
                setState({ phase: "error", message: "This skill is already installed." });
                return;
            }
            setState({ phase: "installing", candidate: selected });
        }
    });
    if (!loadedCandidates && !loadError) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, children: "Find Skills" }), _jsxs(Text, { color: "gray", children: ["query: ", query] }), _jsx(Text, { color: "yellow", children: "Searching local, Git catalogs, and ClawHub..." }), _jsx(Text, { color: "gray", children: "Press q or Esc to exit." })] }));
    }
    if (loadError) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, children: "Find Skills" }), _jsx(Text, { color: "red", children: loadError }), _jsx(Text, { color: "gray", children: "Press q or Esc to exit." })] }));
    }
    if (visibleCandidates.length === 0) {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: ["No matching skills found for \"", query, "\"."] }), _jsx(Text, { color: "gray", children: "Press q or Esc to exit." })] }));
    }
    if (state.phase === "installing") {
        return (_jsx(AddFlowApp, { app: app, request: buildAddFlowRequest(state.candidate), onExit: (result) => {
                setState(mapAddFlowResult(result));
            } }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, children: "Find Skills" }), _jsxs(Text, { color: "gray", children: ["query: ", query, " \u00B7 results: ", visibleCandidates.length, (loadedCandidates?.length ?? 0) > visibleCandidates.length
                        ? ` / ${loadedCandidates?.length ?? 0}`
                        : ""] }), loadWarnings.map((warning) => (_jsxs(Text, { color: "yellow", children: ["warning: ", warning] }, warning))), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { bold: true, children: pad("No.", columns.index) }), _jsx(Text, { bold: true, children: pad("Skill", columns.name) }), _jsx(Text, { bold: true, children: "Repository" })] }), visibleCandidates.map((candidate, index) => {
                const active = index === cursor;
                return (_jsx(Box, { children: _jsxs(Text, { ...(active ? { color: "cyan" } : {}), children: [pad(`${index + 1}.`, columns.index), pad(candidate.installed ? `${candidate.title} *` : candidate.title, columns.name), candidate.sourceLabel] }) }, candidate.id));
            }), selected ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { children: ["selected: ", _jsx(Text, { color: "cyan", children: selected.title }), " \u00B7 ", selected.sourceLabel] }), state.phase === "list" ? (_jsx(Text, { color: "gray", children: "Enter preview add command \u00B7 Up/Down move \u00B7 Esc/q exit" })) : null, state.phase === "confirm" ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: ["next: ", buildFindCommand(selected) ?? "already installed"] }), _jsx(Text, { color: "gray", children: "Enter install \u00B7 Esc back" })] })) : null, state.phase === "done" ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "green", children: state.message }), state.warnings.map((warning) => (_jsxs(Text, { color: "yellow", children: ["warning: ", warning] }, warning))), _jsx(Text, { color: "gray", children: "Press Enter, q, or Esc to exit." })] })) : null, state.phase === "error" ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: "red", children: state.message }), _jsx(Text, { color: "gray", children: "Esc back" })] })) : null] })) : null] }));
}
function getColumns(total) {
    const usable = Math.max(72, total);
    return {
        index: 5,
        name: Math.max(18, Math.floor(usable * 0.26)),
        source: Math.max(12, Math.floor(usable * 0.14)),
    };
}
function pad(value, width) {
    const trimmed = value.length > width - 1 ? `${value.slice(0, width - 2)}…` : value;
    return trimmed.padEnd(width, " ");
}
function buildAddFlowRequest(candidate) {
    if (candidate.action.type === "add-clawhub") {
        return {
            locator: candidate.action.version
                ? `clawhub:${candidate.action.slug}@${candidate.action.version}`
                : `clawhub:${candidate.action.slug}`,
        };
    }
    if (candidate.action.type === "add-git") {
        return {
            locator: candidate.action.locator,
            ...(candidate.action.requestedPath
                ? { path: candidate.action.requestedPath }
                : {}),
        };
    }
    return {
        locator: candidate.locator,
    };
}
function mapAddFlowResult(result) {
    if (result.status === "applied") {
        return {
            phase: "done",
            message: result.message,
            warnings: result.warnings,
        };
    }
    if (result.status === "cancelled") {
        return { phase: "list" };
    }
    return {
        phase: "error",
        message: result.message,
    };
}
//# sourceMappingURL=find-app.js.map