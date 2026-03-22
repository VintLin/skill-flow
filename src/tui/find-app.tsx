import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { SkillCandidate } from "../domain/types.js";
import type { SkillFlowApp } from "../services/skill-flow.js";
import { buildFindCommand } from "../utils/find-command.js";

type FindAppProps = {
  app: SkillFlowApp;
  query: string;
  candidates?: SkillCandidate[];
};

type InstallState =
  | { phase: "list" }
  | { phase: "confirm" }
  | { phase: "installing" }
  | { phase: "done"; message: string; warnings: string[] }
  | { phase: "error"; message: string };

export function FindApp({ app, query, candidates }: FindAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [loadedCandidates, setLoadedCandidates] = useState<SkillCandidate[] | undefined>(candidates);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [state, setState] = useState<InstallState>({ phase: "list" });
  const visibleCandidates = useMemo(
    () => (loadedCandidates ?? []).slice(0, 30),
    [loadedCandidates],
  );
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

      setState({ phase: "installing" });
      void installSelected(app, selected).then((result) => {
        if (result.ok) {
          setState({
            phase: "done",
            message: result.message,
            warnings: result.warnings,
          });
          return;
        }

        setState({ phase: "error", message: result.message });
      });
    }
  });

  if (!loadedCandidates && !loadError) {
    return (
      <Box flexDirection="column">
        <Text bold>Find Skills</Text>
        <Text color="gray">query: {query}</Text>
        <Text color="yellow">Searching local, Git catalogs, and ClawHub...</Text>
        <Text color="gray">Press q or Esc to exit.</Text>
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box flexDirection="column">
        <Text bold>Find Skills</Text>
        <Text color="red">{loadError}</Text>
        <Text color="gray">Press q or Esc to exit.</Text>
      </Box>
    );
  }

  if (visibleCandidates.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No matching skills found for "{query}".</Text>
        <Text color="gray">Press q or Esc to exit.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Find Skills</Text>
      <Text color="gray">
        query: {query} · results: {visibleCandidates.length}
        {(loadedCandidates?.length ?? 0) > visibleCandidates.length
          ? ` / ${loadedCandidates?.length ?? 0}`
          : ""}
      </Text>
      {loadWarnings.map((warning) => (
        <Text key={warning} color="yellow">
          warning: {warning}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text bold>{pad("No.", columns.index)}</Text>
        <Text bold>{pad("Skill", columns.name)}</Text>
        <Text bold>Repository</Text>
      </Box>
      {visibleCandidates.map((candidate, index) => {
        const active = index === cursor;
        return (
          <Box key={candidate.id}>
            <Text {...(active ? { color: "cyan" as const } : {})}>
              {pad(`${index + 1}.`, columns.index)}
              {pad(candidate.installed ? `${candidate.title} *` : candidate.title, columns.name)}
              {candidate.sourceLabel}
            </Text>
          </Box>
        );
      })}

      {selected ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            selected: <Text color="cyan">{selected.title}</Text> · {selected.sourceLabel}
          </Text>
          {state.phase === "list" ? (
            <Text color="gray">Enter preview add command · Up/Down move · Esc/q exit</Text>
          ) : null}
          {state.phase === "confirm" ? (
            <>
              <Text>next: {buildFindCommand(selected) ?? "already installed"}</Text>
              <Text color="gray">Enter install · Esc back</Text>
            </>
          ) : null}
          {state.phase === "installing" ? <Text color="yellow">Installing...</Text> : null}
          {state.phase === "done" ? (
            <>
              <Text color="green">{state.message}</Text>
              {state.warnings.map((warning) => (
                <Text key={warning} color="yellow">
                  warning: {warning}
                </Text>
              ))}
              <Text color="gray">Press Enter, q, or Esc to exit.</Text>
            </>
          ) : null}
          {state.phase === "error" ? (
            <>
              <Text color="red">{state.message}</Text>
              <Text color="gray">Esc back</Text>
            </>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

async function installSelected(app: SkillFlowApp, candidate: SkillCandidate) {
  if (candidate.action.type === "add-clawhub") {
    const locator = candidate.action.version
      ? `clawhub:${candidate.action.slug}@${candidate.action.version}`
      : `clawhub:${candidate.action.slug}`;
    const result = await app.addSource(locator);
    if (!result.ok) {
      return { ok: false as const, message: result.errors[0]?.message ?? "Install failed." };
    }
    return {
      ok: true as const,
      message: `Added ${result.data.manifest.displayName} with ${result.data.leafCount} skills.`,
      warnings: result.warnings.map((warning) => warning.message),
    };
  }

  if (candidate.action.type === "add-git") {
    const result = await app.addSource(
      candidate.action.locator,
      candidate.action.requestedPath
        ? { path: candidate.action.requestedPath }
        : undefined,
    );
    if (!result.ok) {
      return { ok: false as const, message: result.errors[0]?.message ?? "Install failed." };
    }
    return {
      ok: true as const,
      message: `Added ${result.data.manifest.displayName} with ${result.data.leafCount} skills.`,
      warnings: result.warnings.map((warning) => warning.message),
    };
  }

  return { ok: false as const, message: "This skill is already installed." };
}

function getColumns(total: number) {
  const usable = Math.max(72, total);
  return {
    index: 5,
    name: Math.max(18, Math.floor(usable * 0.26)),
    source: Math.max(12, Math.floor(usable * 0.14)),
  };
}

function pad(value: string, width: number) {
  const trimmed = value.length > width - 1 ? `${value.slice(0, width - 2)}…` : value;
  return trimmed.padEnd(width, " ");
}
