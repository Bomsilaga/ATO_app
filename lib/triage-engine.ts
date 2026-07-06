import { ATO_CATEGORIES } from "./taxonomy";
import { TriageNodeState, TaxSession } from "./types";

// The triage engine's one job: make sure no category is ever silently
// treated as "no" without being explicitly asked. A session cannot move to
// output generation while any node is still "unknown".

export function initTriageState(): TriageNodeState[] {
  return ATO_CATEGORIES.map((c) => ({
    code: c.code,
    state: "unknown",
    applies: null
  }));
}

export function isTriageComplete(state: TriageNodeState[]): boolean {
  return state.every((n) => n.state === "asked_and_answered");
}

export function pendingNodes(state: TriageNodeState[]): TriageNodeState[] {
  return state.filter((n) => n.state === "unknown");
}

export function answerNode(
  state: TriageNodeState[],
  code: string,
  applies: boolean,
  notes?: string
): TriageNodeState[] {
  return state.map((n) =>
    n.code === code
      ? { ...n, state: "asked_and_answered", applies, notes }
      : n
  );
}

// Returns the next batch of categories to present as a broad multi-select
// sweep. Grouped so the UI can show a manageable chunk at a time rather than
// one question per screen.
export function nextTriageBatch(
  state: TriageNodeState[],
  batchSize = 8
): TriageNodeState[] {
  return pendingNodes(state).slice(0, batchSize);
}

// Categories that are only relevant if a related structural node applies.
// e.g. rental deductions only get asked in depth if Q21 or ASSET-PROPERTY = true.
const DEPENDENCIES: Record<string, string[]> = {
  "D-RENTAL": ["Q21", "ASSET-PROPERTY"],
  "Q18-CRYPTO-BIZ": ["Q18-CRYPTO", "ASSET-CRYPTO"],
  "SUPER-CO": ["D11"]
};

export function activeCategories(state: TriageNodeState[]): string[] {
  const answeredYes = new Set(
    state.filter((n) => n.state === "asked_and_answered" && n.applies).map((n) => n.code)
  );

  return state
    .filter((n) => {
      if (!(n.state === "asked_and_answered" && n.applies)) return false;
      const deps = DEPENDENCIES[n.code];
      if (!deps) return true;
      // still active on its own answer; dependency list only affects whether
      // we surface *deeper* follow-up prompts, handled client-side.
      return true;
    })
    .map((n) => n.code);
}

export function sessionReadyForGuidance(session: TaxSession): boolean {
  return isTriageComplete(session.triage_state) && activeCategories(session.triage_state).length > 0;
}
