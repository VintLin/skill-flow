export type BuiltinGitSource = {
  locator: string;
  branch: string;
  path?: string;
};

export function getBuiltinGitSources(): BuiltinGitSource[] {
  return [
    { locator: "https://github.com/anthropics/skills.git", branch: "main" },
    { locator: "https://github.com/obra/superpowers.git", branch: "main" },
    { locator: "https://github.com/agentskills/agentskills.git", branch: "main" },
    { locator: "https://github.com/garrytan/gstack.git", branch: "main" },
    { locator: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git", branch: "main" },
    { locator: "https://github.com/pbakaus/impeccable.git", branch: "main" },
    { locator: "https://github.com/JimLiu/baoyu-skills.git", branch: "main" },
    { locator: "https://github.com/vostride/agent-qa.git", branch: "main", path: "skills" },
    { locator: "https://github.com/vercel-labs/skills.git", branch: "main", path: "skills" },
    { locator: "https://github.com/vercel-labs/agent-browser.git", branch: "main", path: "skills" },
    { locator: "https://github.com/vercel-labs/agent-skills.git", branch: "main", path: "skills" },
    { locator: "https://github.com/mattpocock/skills.git", branch: "main", path: "skills/engineering" },
  ];
}
