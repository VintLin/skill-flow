import type { SkillCandidate } from "@skill-flow/core/domain/types.js";
import type { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
type FindAppProps = {
    app: SkillFlowApp;
    query: string;
    candidates?: SkillCandidate[];
};
export declare function FindApp({ app, query, candidates }: FindAppProps): import("react/jsx-runtime").JSX.Element;
export {};
