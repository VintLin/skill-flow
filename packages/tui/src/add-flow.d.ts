import type { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
import { type AddFlowRequest } from "./add-flow-model.js";
export type AddFlowExitResult = {
    status: "applied";
    message: string;
    warnings: string[];
} | {
    status: "cancelled";
    message: string;
} | {
    status: "error";
    message: string;
    warnings?: string[];
};
type AddFlowAppProps = {
    app: SkillFlowApp;
    request: AddFlowRequest;
    onExit?: (result: AddFlowExitResult) => void;
};
type Phase = "loading" | "skills" | "agents-loading" | "agents" | "applying" | "rolling-back" | "done" | "error";
export declare const ADD_BADGE_TEXT = " skill flow ";
export declare function getAddLoadingLabel(phase: Phase): string | undefined;
export declare function AddFlowApp({ app, request, onExit }: AddFlowAppProps): import("react/jsx-runtime").JSX.Element | null;
export declare function runAddFlowNonInteractive(app: SkillFlowApp, request: AddFlowRequest): Promise<AddFlowExitResult>;
export {};
