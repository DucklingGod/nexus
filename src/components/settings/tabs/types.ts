// Shared types for Settings tab components

export interface ProviderConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

export interface AgentPersonality {
  name: string;
  role: string;
  tone: string;
  language: string;
  instructions: string;
}

export interface SshHost {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  key_path: string | null;
  created_at: number;
}

export interface Experience {
  id: string;
  input: string;
  output: string;
  tool_steps: { name: string; ok: boolean }[];
  success: boolean;
  model: string | null;
  feedback: "up" | "down" | null;
  created_at: number;
}

export interface Correction {
  id: string;
  trigger_context: string;
  rule: string;
  created_at: number;
}

export interface Evaluation {
  id: string;
  completion: number;
  satisfaction: number;
  efficiency: number;
  note: string | null;
  created_at: number;
}

export interface PromptVersion {
  id: string;
  target: string;
  previous_text: string;
  new_text: string;
  reason: string | null;
  score: number | null;
  baseline_score: number | null;
  applied: boolean;
  created_at: number;
}

export interface ConnectorStatus {
  platform: string;
  running: boolean;
  status: string;
}

export interface DocItem {
  id: string;
  title: string;
  chunks: number;
}

export interface ContextFile {
  name: string;
  title: string;
  content: string;
}

export interface Capability {
  name: string;
  enabled: boolean;
}

export interface LogLine {
  ts: number;
  text: string;
}
