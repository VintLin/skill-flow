import type { ChannelDetection, DeploymentStrategy, DeploymentTargetName } from "../domain/types.js";
export interface ChannelAdapter {
    readonly target: DeploymentTargetName;
    readonly strategy: DeploymentStrategy;
    detect(): Promise<ChannelDetection>;
    resolveTargetPath(rootPath: string, linkName: string): string;
}
export declare function createChannelAdapters(): ChannelAdapter[];
