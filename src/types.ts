export interface ActionConfig {
  githubToken: string;
  apiKey: string;
  updateTitle: boolean;
  updateBody: boolean;
  overwriteTitle: boolean;
  overwriteBody: boolean;
  maxDiffCharacters: number;
  timeoutSeconds: number;
  exclude: string[];
  language: string;
  model: string;
}

export interface PullRequestInfo {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  baseBranch: string;
  headBranch: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PullRequestData {
  pullRequest: PullRequestInfo;
  commits: CommitInfo[];
  files: ChangedFile[];
}

export interface GenerationContext {
  currentTitle: string;
  currentBody: string | null;
  baseBranch: string;
  headBranch: string;
  commits: string[];
  files: Array<Omit<ChangedFile, "patch">>;
  diffExcerpts: Array<{ filename: string; patch: string }>;
  totals: { additions: number; deletions: number; files: number };
  truncated: boolean;
}

export interface GeneratedNote {
  title: string;
  summary: string;
  changes: string[];
  testing: string[];
  notes: string[];
}

export interface UpdateDecision {
  title?: string;
  body?: string;
  titleUpdated: boolean;
  bodyUpdated: boolean;
}
