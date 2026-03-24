import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { DeploymentTargetName, DraftBinding } from "../domain/types.js";
import type { SkillFlowApp } from "../services/skill-flow.js";
import {
  ALL_AGENTS_CHOICE_ID,
  ALL_SKILLS_CHOICE_ID,
  type AddChoice,
  type AddFlowPrepared,
  type AddFlowRequest,
  areAllSelected,
  buildAddCompletionMessage,
  buildInitialDraft,
  buildLeafChoices,
  buildTargetChoices,
  filterChoices,
  toggleAllSelections,
  withAllChoice,
} from "./add-flow-model.js";

export type AddFlowExitResult =
  | { status: "applied"; message: string; warnings: string[] }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string; warnings?: string[] };

type AddFlowAppProps = {
  app: SkillFlowApp;
  request: AddFlowRequest;
  onExit?: (result: AddFlowExitResult) => void;
};

type Phase =
  | "loading"
  | "skills"
  | "agents-loading"
  | "agents"
  | "applying"
  | "rolling-back"
  | "done"
  | "error";

type PreparedSession = AddFlowPrepared & {
  sourceId: string;
};

type SelectionStep = "skills" | "agents";
type InputKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  leftArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
};

export function AddFlowApp({ app, request, onExit }: AddFlowAppProps) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<PreparedSession | undefined>();
  const [draft, setDraft] = useState<DraftBinding | undefined>();
  const [message, setMessage] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<SelectionStep>("skills");
  const [skillQuery, setSkillQuery] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [skillCursor, setSkillCursor] = useState(0);
  const [agentCursor, setAgentCursor] = useState(0);
  const [inlineError, setInlineError] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<AddFlowExitResult | undefined>();

  const leafChoices = useMemo(
    () => (session ? buildLeafChoices(session.leafs) : []),
    [session],
  );
  const targetChoices = useMemo(
    () => (session ? buildTargetChoices(session.availableTargets) : []),
    [session],
  );
  const visibleLeafChoices = useMemo(
    () => filterChoices(leafChoices, skillQuery),
    [leafChoices, skillQuery],
  );
  const skillChoicesWithAll = useMemo(
    () => withAllChoice(visibleLeafChoices, "All skills", ALL_SKILLS_CHOICE_ID),
    [visibleLeafChoices],
  );
  const visibleTargetChoices = useMemo(
    () => filterChoices(targetChoices, agentQuery),
    [targetChoices, agentQuery],
  );
  const targetChoicesWithAll = useMemo(
    () => withAllChoice(visibleTargetChoices, "All agents", ALL_AGENTS_CHOICE_ID),
    [visibleTargetChoices],
  );

  useEffect(() => {
    if (
      !session ||
      request.yes ||
      request.all ||
      request.requestedAgents?.length ||
      session.availableTargets.length > 0
    ) {
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
        await applyDraftAndFinish(
          app,
          nextSession,
          nextDraft,
          setPhase,
          setMessage,
          setWarnings,
          setLastResult,
        );
        return;
      }

      const shouldPromptSkills =
        !(request.requestedSkills?.length) && nextSession.leafs.length > 1;
      const shouldPromptAgents =
        !(request.requestedAgents?.length) && nextSession.availableTargets.length > 1;

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

      await applyDraftAndFinish(
        app,
        nextSession,
        nextDraft,
        setPhase,
        setMessage,
        setWarnings,
        setLastResult,
      );
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
          const resolvedSession = await ensureTargetsLoaded(
            app,
            session,
            request,
            setPhase,
            setSession,
            setDraft,
          );
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
          await applyDraftAndFinish(
            app,
            resolvedSession,
            draft,
            setPhase,
            setMessage,
            setWarnings,
            setLastResult,
          );
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
            enabledTargets: enabledTargets as DeploymentTargetName[],
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
          await applyDraftAndFinish(
            app,
            session,
            draft,
            setPhase,
            setMessage,
            setWarnings,
            setLastResult,
          );
        },
      });
      return;
    }
  });

  if (phase === "loading") {
    return (
      <Box flexDirection="column">
        <Text bold>Add Skills Group</Text>
        <Text color="gray">◆ Parsing source</Text>
        <Text color="gray">◆ Discovering skills</Text>
        <Text color="gray">q or Esc cancel after discovery</Text>
      </Box>
    );
  }

  if (phase === "agents-loading") {
    return (
      <Box flexDirection="column">
        <Text bold>Add Skills Group</Text>
        <Text color="gray">Source: {session?.source.displayName ?? "loading..."}</Text>
        <Text bold>◆ Detecting available agents</Text>
        <Text color="gray">Skills are ready. Loading agent targets in the background...</Text>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column">
        <Text bold>Add Skills Group</Text>
        <Text color="red">{message}</Text>
        {warnings.map((warning) => (
          <Text key={warning} color="yellow">
            warning: {warning}
          </Text>
        ))}
        <Text color="gray">Enter, q, or Esc exit</Text>
      </Box>
    );
  }

  if (!session || !draft) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Add Skills Group</Text>
      <Text color="gray">Source: {session.source.displayName}</Text>
      <Text color="gray">
        Skills: {draft.selectedLeafIds.length}/{session.leafs.length} · Agents: {draft.enabledTargets.length}
      </Text>
      {warnings.map((warning) => (
        <Text key={warning} color="yellow">
          warning: {warning}
        </Text>
      ))}
      {phase === "skills"
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
        : null}
      {phase === "agents"
        ? renderSelectionStep({
            title: "◆ Select agents to project to",
            query: agentQuery,
            choices: targetChoicesWithAll,
            cursor: agentCursor,
            selectedIds: draft.enabledTargets,
            allChoiceId: ALL_AGENTS_CHOICE_ID,
            allSelectableIds: targetChoices.map((choice) => choice.id),
            footer:
              currentStep === "agents" && session.leafs.length > 1 && !(request.requestedSkills?.length)
                ? "Type to filter · Space toggle · Enter install · ← back · Esc cancel"
                : "Type to filter · Space toggle · Enter install · Esc cancel",
            emptyMessage:
              session.availableTargets.length === 0
                ? "No agents detected. Continue to install the source without projections."
                : "No agents match the current filter.",
            selectedSummary: summarizeSelectedChoices(targetChoices, draft.enabledTargets),
            ...(inlineError ? { inlineError } : {}),
          })
        : null}
      {phase === "applying" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>◆ Installing</Text>
          <Text color="gray">Applying selected skills and agents...</Text>
        </Box>
      ) : null}
      {phase === "rolling-back" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>■ Cancelling</Text>
          <Text color="gray">Rolling back imported source...</Text>
        </Box>
      ) : null}
      {phase === "done" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green">{message}</Text>
          <Text color="gray">Enter, q, or Esc exit</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export async function runAddFlowNonInteractive(
  app: SkillFlowApp,
  request: AddFlowRequest,
): Promise<AddFlowExitResult> {
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
    message: buildAddCompletionMessage(
      prepared.value.source,
      applyResult.data.draft,
      prepared.value.leafs,
    ),
    warnings: [...prepared.value.importWarnings, ...applyResult.warnings.map((warning) => warning.message)],
  };
}

async function prepareAddSession(
  app: SkillFlowApp,
  request: AddFlowRequest,
): Promise<
  | { ok: true; value: PreparedSession }
  | { ok: false; message: string; warnings?: string[] }
> {
  const added = await app.prepareAddSource(request.locator, {
    ...(request.path ? { path: request.path } : {}),
    ...(!request.yes && !request.all && !request.requestedAgents?.length
      ? { skipTargetDetection: true }
      : {}),
    ...(!request.all && request.requestedSkills?.length
      ? { skillNames: request.requestedSkills }
      : {}),
    ...(!request.all && request.requestedAgents?.length
      ? { agentTargets: request.requestedAgents as DeploymentTargetName[] }
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
  const initialDraft =
    request.all || request.yes
      ? buildInitialDraft(added.data.leafs, added.data.availableTargets, {
          ...(added.data.manifest.requestedPath
            ? { requestedPath: added.data.manifest.requestedPath }
            : {}),
          ...(request.yes ? { yes: true } : {}),
          ...(request.all ? { all: true } : {}),
        })
      : { ok: true as const, value: added.data.draft };
  if (!initialDraft.ok) {
    await app.rollbackPreparedSource(sourceId).catch(() => {});
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

async function ensureTargetsLoaded(
  app: SkillFlowApp,
  session: PreparedSession,
  request: AddFlowRequest,
  setPhase: (phase: Phase) => void,
  setSession: (session: PreparedSession | ((current: PreparedSession | undefined) => PreparedSession | undefined)) => void,
  setDraft: (draft: DraftBinding | ((current: DraftBinding | undefined) => DraftBinding | undefined)) => void,
): Promise<PreparedSession | undefined> {
  if (
    request.yes ||
    request.all ||
    request.requestedAgents?.length ||
    session.availableTargets.length > 0
  ) {
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

async function applyDraftAndFinish(
  app: SkillFlowApp,
  session: PreparedSession,
  draft: DraftBinding,
  setPhase: (phase: Phase) => void,
  setMessage: (message: string) => void,
  setWarnings: (warnings: string[]) => void,
  setLastResult: (result: AddFlowExitResult) => void,
) {
  setPhase("applying");
  const applied = await app.applyDraft(session.sourceId, draft);
  if (!applied.ok) {
    const nextWarnings = [...session.importWarnings, ...applied.warnings.map((warning) => warning.message)];
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

  const nextWarnings = [...session.importWarnings, ...applied.warnings.map((warning) => warning.message)];
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

async function rollbackAndExit(
  app: SkillFlowApp,
  sourceId: string,
  setPhase: (phase: Phase) => void,
  setMessage: (message: string) => void,
  setLastResult: (result: AddFlowExitResult) => void,
  onExit: AddFlowAppProps["onExit"],
  exit: () => void,
) {
  setPhase("rolling-back");
  const removed = await app.rollbackPreparedSource(sourceId);
  if (!removed.ok) {
    const message = removed.errors[0]?.message ?? "Unable to roll back cancelled add.";
    setMessage(message);
    setLastResult({ status: "error", message });
    setPhase("error");
    return;
  }

  const result: AddFlowExitResult = {
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

function handleSelectionInput({
  input,
  key,
  choices,
  cursor,
  setCursor,
  query,
  setQuery,
  selectedIds,
  allChoiceId,
  allSelectableIds,
  setSelectedIds,
  onBack,
  onConfirm,
}: {
  input: string;
  key: InputKey;
  choices: AddChoice[];
  cursor: number;
  setCursor: (cursor: number | ((cursor: number) => number)) => void;
  query: string;
  setQuery: (query: string) => void;
  selectedIds: string[];
  allChoiceId?: string;
  allSelectableIds: string[];
  setSelectedIds: (selectedIds: string[]) => void;
  onBack?: () => void;
  onConfirm: () => void | Promise<void>;
}) {
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
    } else {
      selected.add(current.id);
    }
    setSelectedIds(choices.map((choice) => choice.id).filter((id) => selected.has(id)).concat(
      selectedIds.filter((id) => !choices.some((choice) => choice.id === id)),
    ));
    return;
  }

  if (!key.ctrl && !key.meta && input.length === 1 && /[^\s]/.test(input)) {
    setQuery(`${query}${input}`);
    setCursor(0);
  }
}

function renderSelectionStep({
  title,
  query,
  choices,
  cursor,
  selectedIds,
  allChoiceId,
  allSelectableIds,
  footer,
  emptyMessage,
  selectedSummary,
  inlineError,
}: {
  title: string;
  query: string;
  choices: AddChoice[];
  cursor: number;
  selectedIds: readonly string[];
  allChoiceId?: string;
  allSelectableIds: readonly string[];
  footer: string;
  emptyMessage: string;
  selectedSummary: string;
  inlineError?: string;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{title}</Text>
      <Text color="gray">Search: {query || " "}</Text>
      <Text color="gray">{footer}</Text>
      <Box flexDirection="column" marginTop={1}>
        {choices.length === 0 ? (
          <Text color="gray">{emptyMessage}</Text>
        ) : (
          choices.map((choice, index) => {
            const active = index === cursor;
            const selected =
              choice.id === allChoiceId
                ? areAllSelected(selectedIds, allSelectableIds)
                : selectedIds.includes(choice.id);
            return (
              <Text key={choice.id} {...(active ? { color: "cyan" as const } : {})}>
                {active ? "❯" : " "} {selected ? "●" : "○"} {choice.label}
                {choice.hint ? <Text color="gray">  {choice.hint}</Text> : null}
              </Text>
            );
          })
        )}
      </Box>
      <Text color="gray">Selected: {selectedSummary}</Text>
      {inlineError ? <Text color="red">{inlineError}</Text> : null}
    </Box>
  );
}

function summarizeSelectedChoices(choices: AddChoice[], selectedIds: readonly string[]) {
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

function closeFlow(
  result: AddFlowExitResult | undefined,
  onExit: AddFlowAppProps["onExit"],
  exit: () => void,
) {
  if (result && onExit) {
    onExit(result);
    return;
  }

  exit();
}
