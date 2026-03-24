import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { ALL_AGENTS_CHOICE_ID, ALL_SKILLS_CHOICE_ID, areAllSelected, buildAddCompletionMessage, buildInitialDraft, buildLeafChoices, buildSummaryLines, buildTargetChoices, filterChoices, toggleAllSelections, withAllChoice, } from "./add-flow-model.js";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const ADD_BADGE_TEXT = " skill flow ";
export function getAddLoadingLabel(phase) {
    switch (phase) {
        case "loading":
            return "Preparing source and discovering skills...";
        case "agents-loading":
            return "Loading available agents...";
        case "applying":
            return "Applying selected skills and agents...";
        case "rolling-back":
            return "Rolling back imported source...";
        default:
            return undefined;
    }
}
export function AddFlowApp({ app, request, onExit }) {
    const { exit } = useApp();
    const [phase, setPhase] = useState("loading");
    const [session, setSession] = useState();
    const [draft, setDraft] = useState();
    const [preview, setPreview] = useState();
    const [message, setMessage] = useState("");
    const [warnings, setWarnings] = useState([]);
    const [currentStep, setCurrentStep] = useState("skills");
    const [skillQuery, setSkillQuery] = useState("");
    const [agentQuery, setAgentQuery] = useState("");
    const [skillCursor, setSkillCursor] = useState(0);
    const [agentCursor, setAgentCursor] = useState(0);
    const [inlineError, setInlineError] = useState();
    const [lastResult, setLastResult] = useState();
    const spinnerFrame = useSpinnerFrame(phase === "loading" ||
        phase === "agents-loading" ||
        phase === "applying" ||
        phase === "rolling-back");
    const leafChoices = useMemo(() => (session ? buildLeafChoices(session.leafs) : []), [session]);
    const targetChoices = useMemo(() => (session ? buildTargetChoices(session.availableTargets) : []), [session]);
    const visibleLeafChoices = useMemo(() => filterChoices(leafChoices, skillQuery), [leafChoices, skillQuery]);
    const skillChoicesWithAll = useMemo(() => withAllChoice(visibleLeafChoices, "All skills", ALL_SKILLS_CHOICE_ID), [visibleLeafChoices]);
    const visibleTargetChoices = useMemo(() => filterChoices(targetChoices, agentQuery), [targetChoices, agentQuery]);
    const targetChoicesWithAll = useMemo(() => withAllChoice(visibleTargetChoices, "All agents", ALL_AGENTS_CHOICE_ID), [visibleTargetChoices]);
    useEffect(() => {
        if (!session ||
            request.yes ||
            request.all ||
            request.requestedAgents?.length ||
            session.availableTargets.length > 0) {
            return;
        }
        let cancelled = false;
        void app.getAvailableTargets().then((targets) => {
            if (cancelled) {
                return;
            }
            setSession((current) => (current ? { ...current, availableTargets: targets } : current));
            setDraft((current) => {
                if (!current || current.enabledTargets.length > 0) {
                    return current;
                }
                return {
                    ...current,
                    enabledTargets: [...targets],
                };
            });
        });
        return () => {
            cancelled = true;
        };
    }, [app, request.all, request.requestedAgents, request.yes, session]);
    useEffect(() => {
        let cancelled = false;
        void prepareAddSession(app, request).then(async (result) => {
            if (cancelled) {
                return;
            }
            if (!result.ok) {
                setPhase("error");
                setMessage(result.message);
                setWarnings(result.warnings ?? []);
                setLastResult({
                    status: "error",
                    message: result.message,
                    ...(result.warnings ? { warnings: result.warnings } : {}),
                });
                return;
            }
            const nextSession = result.value;
            const nextDraft = nextSession.draft;
            setSession(nextSession);
            setDraft(nextDraft);
            setWarnings(nextSession.importWarnings);
            if (request.yes || request.all) {
                await applyDraftAndFinish(app, nextSession, nextDraft, setPhase, setPreview, setMessage, setWarnings, setLastResult);
                return;
            }
            const shouldPromptSkills = !(request.requestedSkills?.length) && nextSession.leafs.length > 1;
            const shouldPromptAgents = !(request.requestedAgents?.length) && nextSession.availableTargets.length > 1;
            if (shouldPromptSkills) {
                setPhase("skills");
                setCurrentStep("skills");
                return;
            }
            if (shouldPromptAgents) {
                setPhase("agents");
                setCurrentStep("agents");
                return;
            }
            await applyDraftAndFinish(app, nextSession, nextDraft, setPhase, setPreview, setMessage, setWarnings, setLastResult);
        });
        return () => {
            cancelled = true;
        };
    }, [app, request]);
    useInput((input, key) => {
        if (phase === "loading" || phase === "agents-loading" || phase === "applying" || phase === "rolling-back") {
            return;
        }
        if (phase === "done" || phase === "error") {
            if (key.return || key.escape || input === "q") {
                closeFlow(lastResult, onExit, exit);
            }
            return;
        }
        if (key.escape || input === "q") {
            if (!session) {
                closeFlow({ status: "cancelled", message: "Add cancelled." }, onExit, exit);
                return;
            }
            void rollbackAndExit(app, session.sourceId, setPhase, setMessage, setLastResult, onExit, exit);
            return;
        }
        if (!session || !draft) {
            return;
        }
        if (phase === "skills") {
            handleSelectionInput({
                input,
                key,
                choices: skillChoicesWithAll,
                cursor: skillCursor,
                setCursor: setSkillCursor,
                query: skillQuery,
                setQuery: setSkillQuery,
                selectedIds: draft.selectedLeafIds,
                allChoiceId: ALL_SKILLS_CHOICE_ID,
                allSelectableIds: leafChoices.map((choice) => choice.id),
                setSelectedIds: (selectedLeafIds) => {
                    setDraft({ ...draft, selectedLeafIds });
                },
                onConfirm: async () => {
                    setInlineError(undefined);
                    const resolvedSession = await ensureTargetsLoaded(app, session, request, setPhase, setSession, setDraft);
                    if (!resolvedSession) {
                        setPhase("error");
                        setMessage("Unable to detect available agents.");
                        return;
                    }
                    if (!(request.requestedAgents?.length) && resolvedSession.availableTargets.length > 1) {
                        setPhase("agents");
                        setCurrentStep("agents");
                        return;
                    }
                    await applyDraftAndFinish(app, resolvedSession, draft, setPhase, setPreview, setMessage, setWarnings, setLastResult);
                },
            });
            return;
        }
        if (phase === "agents") {
            handleSelectionInput({
                input,
                key,
                choices: targetChoicesWithAll,
                cursor: agentCursor,
                setCursor: setAgentCursor,
                query: agentQuery,
                setQuery: setAgentQuery,
                selectedIds: draft.enabledTargets,
                allChoiceId: ALL_AGENTS_CHOICE_ID,
                allSelectableIds: targetChoices.map((choice) => choice.id),
                setSelectedIds: (enabledTargets) => {
                    setDraft({
                        ...draft,
                        enabledTargets: enabledTargets,
                    });
                },
                ...(session.leafs.length > 1 && !(request.requestedSkills?.length)
                    ? {
                        onBack: () => {
                            setInlineError(undefined);
                            setPhase("skills");
                            setCurrentStep("skills");
                        },
                    }
                    : {}),
                onConfirm: async () => {
                    setInlineError(undefined);
                    await applyDraftAndFinish(app, session, draft, setPhase, setPreview, setMessage, setWarnings, setLastResult);
                },
            });
            return;
        }
    });
    if (phase === "loading") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(AddFlowHeader, {}), _jsxs(Text, { bold: true, children: [spinnerFrame, " ", getAddLoadingLabel("loading")] }), _jsx(Text, { color: "gray", children: "q or Esc cancel after discovery" })] }));
    }
    if (phase === "agents-loading") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(AddFlowHeader, {}), _jsxs(Text, { color: "gray", children: ["Source: ", session?.source.displayName ?? "loading..."] }), _jsxs(Text, { bold: true, children: [spinnerFrame, " ", getAddLoadingLabel("agents-loading")] }), _jsx(Text, { color: "gray", children: "Skills are ready. Agent targets are loading in the background..." })] }));
    }
    if (phase === "error") {
        return (_jsxs(Box, { flexDirection: "column", children: [_jsx(AddFlowHeader, {}), _jsx(Text, { color: "red", children: message }), warnings.map((warning) => (_jsxs(Text, { color: "yellow", children: ["warning: ", warning] }, warning))), _jsx(Text, { color: "gray", children: "Enter, q, or Esc exit" })] }));
    }
    if (!session || !draft) {
        return null;
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(AddFlowHeader, {}), _jsxs(Text, { color: "gray", children: ["Source: ", session.source.displayName] }), _jsxs(Text, { color: "gray", children: ["Skills: ", draft.selectedLeafIds.length, "/", session.leafs.length, " \u00B7 Agents: ", draft.enabledTargets.length] }), warnings.map((warning) => (_jsxs(Text, { color: "yellow", children: ["warning: ", warning] }, warning))), phase === "skills"
                ? renderSelectionStep({
                    title: "◆ Select skills to enable",
                    query: skillQuery,
                    choices: skillChoicesWithAll,
                    cursor: skillCursor,
                    selectedIds: draft.selectedLeafIds,
                    allChoiceId: ALL_SKILLS_CHOICE_ID,
                    allSelectableIds: leafChoices.map((choice) => choice.id),
                    footer: "Type to filter · Space toggle · Enter continue · Esc cancel",
                    emptyMessage: "No skills match the current filter.",
                    selectedSummary: summarizeSelectedChoices(leafChoices, draft.selectedLeafIds),
                    ...(inlineError ? { inlineError } : {}),
                })
                : null, phase === "agents"
                ? renderSelectionStep({
                    title: "◆ Select agents to project to",
                    query: agentQuery,
                    choices: targetChoicesWithAll,
                    cursor: agentCursor,
                    selectedIds: draft.enabledTargets,
                    allChoiceId: ALL_AGENTS_CHOICE_ID,
                    allSelectableIds: targetChoices.map((choice) => choice.id),
                    footer: currentStep === "agents" && session.leafs.length > 1 && !(request.requestedSkills?.length)
                        ? "Type to filter · Space toggle · Enter install · ← back · Esc cancel"
                        : "Type to filter · Space toggle · Enter install · Esc cancel",
                    emptyMessage: session.availableTargets.length === 0
                        ? "No agents detected. Continue to install the source without projections."
                        : "No agents match the current filter.",
                    selectedSummary: summarizeSelectedChoices(targetChoices, draft.enabledTargets),
                    ...(inlineError ? { inlineError } : {}),
                })
                : null, phase === "applying" ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: "\u25C6 Installation Summary" }), preview && session && draft
                        ? buildSummaryLines({
                            source: session.source,
                            leafs: session.leafs,
                            availableTargets: session.availableTargets,
                            draft,
                            importWarnings: session.importWarnings,
                            ...(session.requestedPath ? { requestedPath: session.requestedPath } : {}),
                        }, preview).map((line) => _jsx(Text, { children: line }, line))
                        : null, _jsx(Text, { children: " " }), _jsxs(Text, { bold: true, children: [spinnerFrame, " Installing"] }), _jsx(Text, { color: "gray", children: getAddLoadingLabel("applying") })] })) : null, phase === "rolling-back" ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { bold: true, children: [spinnerFrame, " Cancelling"] }), _jsx(Text, { color: "gray", children: getAddLoadingLabel("rolling-back") })] })) : null, phase === "done" ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [preview && session && draft
                        ? buildSummaryLines({
                            source: session.source,
                            leafs: session.leafs,
                            availableTargets: session.availableTargets,
                            draft,
                            importWarnings: session.importWarnings,
                            ...(session.requestedPath ? { requestedPath: session.requestedPath } : {}),
                        }, preview).map((line) => _jsx(Text, { children: line }, line))
                        : null, preview ? _jsx(Text, { children: " " }) : null, _jsx(Text, { color: "green", children: message }), _jsx(Text, { color: "gray", children: "Enter, q, or Esc exit" })] })) : null] }));
}
function AddFlowHeader() {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { backgroundColor: "cyan", color: "black", children: ADD_BADGE_TEXT }), _jsx(Text, { bold: true, children: "Add Skills Group" })] }));
}
export async function runAddFlowNonInteractive(app, request) {
    const prepared = await prepareAddSession(app, request);
    if (!prepared.ok) {
        return {
            status: "error",
            message: prepared.message,
            ...(prepared.warnings ? { warnings: prepared.warnings } : {}),
        };
    }
    const applyResult = await app.applyDraft(prepared.value.sourceId, prepared.value.draft);
    if (!applyResult.ok) {
        return {
            status: "error",
            message: applyResult.errors[0]?.message ?? "Install failed.",
            warnings: [...prepared.value.importWarnings, ...applyResult.warnings.map((warning) => warning.message)],
        };
    }
    return {
        status: "applied",
        message: buildAddCompletionMessage(prepared.value.source, applyResult.data.draft, prepared.value.leafs),
        warnings: [...prepared.value.importWarnings, ...applyResult.warnings.map((warning) => warning.message)],
    };
}
async function prepareAddSession(app, request) {
    const added = await app.prepareAddSource(request.locator, {
        ...(request.path ? { path: request.path } : {}),
        ...(!request.yes && !request.all && !request.requestedAgents?.length
            ? { skipTargetDetection: true }
            : {}),
        ...(!request.all && request.requestedSkills?.length
            ? { skillNames: request.requestedSkills }
            : {}),
        ...(!request.all && request.requestedAgents?.length
            ? { agentTargets: request.requestedAgents }
            : {}),
    });
    if (!added.ok) {
        return {
            ok: false,
            message: added.errors[0]?.message ?? "Unable to add source.",
            warnings: added.warnings.map((warning) => warning.message),
        };
    }
    const sourceId = added.data.sourceId;
    const initialDraft = request.all || request.yes
        ? buildInitialDraft(added.data.leafs, added.data.availableTargets, {
            ...(added.data.manifest.requestedPath
                ? { requestedPath: added.data.manifest.requestedPath }
                : {}),
            ...(request.yes ? { yes: true } : {}),
            ...(request.all ? { all: true } : {}),
        })
        : { ok: true, value: added.data.draft };
    if (!initialDraft.ok) {
        await app.rollbackPreparedSource(sourceId).catch(() => { });
        return {
            ok: false,
            message: initialDraft.message,
            warnings: added.warnings.map((warning) => warning.message),
        };
    }
    return {
        ok: true,
        value: {
            sourceId,
            source: added.data.manifest,
            leafs: added.data.leafs,
            availableTargets: added.data.availableTargets,
            draft: initialDraft.value,
            importWarnings: added.warnings.map((warning) => warning.message),
            ...(added.data.manifest.requestedPath
                ? { requestedPath: added.data.manifest.requestedPath }
                : {}),
        },
    };
}
async function ensureTargetsLoaded(app, session, request, setPhase, setSession, setDraft) {
    if (request.yes ||
        request.all ||
        request.requestedAgents?.length ||
        session.availableTargets.length > 0) {
        return session;
    }
    setPhase("agents-loading");
    const targets = await app.getAvailableTargets();
    const nextSession = { ...session, availableTargets: targets };
    setSession(nextSession);
    setDraft((current) => {
        if (!current || current.enabledTargets.length > 0) {
            return current;
        }
        return {
            ...current,
            enabledTargets: [...targets],
        };
    });
    return nextSession;
}
async function applyDraftAndFinish(app, session, draft, setPhase, setPreview, setMessage, setWarnings, setLastResult) {
    const preview = await app.previewDraft(session.sourceId, draft);
    if (!preview.ok) {
        const nextWarnings = [...session.importWarnings, ...preview.warnings.map((warning) => warning.message)];
        setWarnings(nextWarnings);
        setMessage(preview.errors[0]?.message ?? "Unable to build installation summary.");
        setLastResult({
            status: "error",
            message: preview.errors[0]?.message ?? "Unable to build installation summary.",
            warnings: nextWarnings,
        });
        setPhase("error");
        return;
    }
    setPreview(preview.data.plan);
    setWarnings([...session.importWarnings, ...preview.warnings.map((warning) => warning.message)]);
    setPhase("applying");
    const applied = await app.applyDraft(session.sourceId, draft);
    if (!applied.ok) {
        const nextWarnings = [
            ...session.importWarnings,
            ...preview.warnings.map((warning) => warning.message),
            ...applied.warnings.map((warning) => warning.message),
        ];
        setWarnings(nextWarnings);
        setMessage(applied.errors[0]?.message ?? "Install failed.");
        setLastResult({
            status: "error",
            message: applied.errors[0]?.message ?? "Install failed.",
            warnings: nextWarnings,
        });
        setPhase("error");
        return;
    }
    const nextWarnings = [
        ...session.importWarnings,
        ...preview.warnings.map((warning) => warning.message),
        ...applied.warnings.map((warning) => warning.message),
    ];
    const nextMessage = buildAddCompletionMessage(session.source, applied.data.draft, session.leafs);
    setWarnings(nextWarnings);
    setMessage(nextMessage);
    setLastResult({
        status: "applied",
        message: nextMessage,
        warnings: nextWarnings,
    });
    setPhase("done");
}
async function rollbackAndExit(app, sourceId, setPhase, setMessage, setLastResult, onExit, exit) {
    setPhase("rolling-back");
    const removed = await app.rollbackPreparedSource(sourceId);
    if (!removed.ok) {
        const message = removed.errors[0]?.message ?? "Unable to roll back cancelled add.";
        setMessage(message);
        setLastResult({ status: "error", message });
        setPhase("error");
        return;
    }
    const result = {
        status: "cancelled",
        message: "Add cancelled.",
    };
    setMessage(result.message);
    setLastResult(result);
    if (onExit) {
        onExit(result);
        return;
    }
    exit();
}
function handleSelectionInput({ input, key, choices, cursor, setCursor, query, setQuery, selectedIds, allChoiceId, allSelectableIds, setSelectedIds, onBack, onConfirm, }) {
    if (key.upArrow) {
        setCursor((current) => Math.max(0, current - 1));
        return;
    }
    if (key.downArrow) {
        setCursor((current) => Math.min(Math.max(choices.length - 1, 0), current + 1));
        return;
    }
    if (key.leftArrow) {
        onBack?.();
        return;
    }
    if (key.return) {
        void onConfirm();
        return;
    }
    if (key.backspace || key.delete) {
        setQuery(query.slice(0, -1));
        setCursor(0);
        return;
    }
    if (input === " ") {
        const current = choices[cursor];
        if (!current) {
            return;
        }
        if (allChoiceId && current.id === allChoiceId) {
            setSelectedIds(toggleAllSelections(selectedIds, allSelectableIds));
            return;
        }
        const selected = new Set(selectedIds);
        if (selected.has(current.id)) {
            selected.delete(current.id);
        }
        else {
            selected.add(current.id);
        }
        setSelectedIds(choices.map((choice) => choice.id).filter((id) => selected.has(id)).concat(selectedIds.filter((id) => !choices.some((choice) => choice.id === id))));
        return;
    }
    if (!key.ctrl && !key.meta && input.length === 1 && /[^\s]/.test(input)) {
        setQuery(`${query}${input}`);
        setCursor(0);
    }
}
function renderSelectionStep({ title, query, choices, cursor, selectedIds, allChoiceId, allSelectableIds, footer, emptyMessage, selectedSummary, inlineError, }) {
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, children: title }), _jsxs(Text, { color: "gray", children: ["Search: ", query || " "] }), _jsx(Text, { color: "gray", children: footer }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: choices.length === 0 ? (_jsx(Text, { color: "gray", children: emptyMessage })) : (choices.map((choice, index) => {
                    const active = index === cursor;
                    const selected = choice.id === allChoiceId
                        ? areAllSelected(selectedIds, allSelectableIds)
                        : selectedIds.includes(choice.id);
                    return (_jsxs(Text, { ...(active ? { color: "cyan" } : {}), children: [active ? "❯" : " ", " ", selected ? "●" : "○", " ", choice.label, choice.hint ? _jsxs(Text, { color: "gray", children: ["  ", choice.hint] }) : null] }, choice.id));
                })) }), _jsxs(Text, { color: "gray", children: ["Selected: ", selectedSummary] }), inlineError ? _jsx(Text, { color: "red", children: inlineError }) : null] }));
}
function summarizeSelectedChoices(choices, selectedIds) {
    const labels = choices
        .filter((choice) => selectedIds.includes(choice.id))
        .map((choice) => choice.label);
    if (labels.length === 0) {
        return "none";
    }
    if (labels.length <= 4) {
        return labels.join(", ");
    }
    return `${labels.slice(0, 4).join(", ")}, +${labels.length - 4} more`;
}
function closeFlow(result, onExit, exit) {
    if (result && onExit) {
        onExit(result);
        return;
    }
    exit();
}
function useSpinnerFrame(active) {
    const [frameIndex, setFrameIndex] = useState(0);
    useEffect(() => {
        if (!active) {
            setFrameIndex(0);
            return;
        }
        const timer = setInterval(() => {
            setFrameIndex((current) => (current + 1) % SPINNER_FRAMES.length);
        }, 80);
        return () => {
            clearInterval(timer);
        };
    }, [active]);
    return SPINNER_FRAMES[frameIndex] ?? SPINNER_FRAMES[0];
}
//# sourceMappingURL=add-flow.js.map