import type { ScoreResult } from "@/lib/prompts/score";
import type {
  CallLogs,
  Project,
  SetupResponse,
  Stakeholder,
} from "@/lib/types";
import type { Persona, Scenario } from "./store";

/**
 * Text generation provider contract.
 *
 * This contract is the source of truth for provider capabilities.
 * Endpoint HTTP contracts are documented separately under `docs/design/Endpoint/`.
 */
export interface AIProvider {
  /**
   * Generate a scenario instance from prompts.
   */
  generateSetup(input: SetupInput): Promise<SetupResponse>;

  /**
   * Generate one work document requested during a call.
   */
  generateDocument(
    input: DocumentGenerationInput
  ): Promise<DocumentGenerationResult>;

  /**
   * Evaluate the whole session from the conversation logs.
   */
  evaluateSession(input: SessionEvaluationInput): Promise<ScoreResult>;
}

export type SetupInput = {
  // The authored scenario (4 prompts + title/description) and its cast of
  // personas. The setup prompt rolls a concrete instance from these.
  scenario: Scenario;
  personas: Persona[];
  seed?: string; // optional extra randomization
};

export type DocumentGenerationInput = {
  project: Project;
  stakeholders: Stakeholder[];
  // Which stakeholder's call invoked the document tool — the adapter must
  // generate as this specific persona, not guess from role text (role is a
  // free-form label rolled per play, not a stable identifier).
  stakeholderId: string;
  request: string;
};

export type DocumentGenerationResult = {
  title: string;
  body: string;
};

export type SessionEvaluationInput = {
  project: Project;
  stakeholders: Stakeholder[];
  callLogs: CallLogs;
};
