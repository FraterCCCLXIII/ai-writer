import type { ChatMode } from "./types";

/**
 * Lightweight heuristic that maps a user message to a suggested chat mode.
 * No LLM call — purely keyword/regex based. Used to show "switch mode?" nudges.
 */

const AGENT_PATTERNS = [
  /\b(plan|outline|structure|organize|restructure)\b/i,
  /\b(write\s+(all|the\s+whole|every|multiple|several)\s+(chapter|section|part))/i,
  /\b(go\s+through\s+(each|all|every))\b/i,
  /\b(from\s+research\s+to|draft\s+the\s+manuscript|build\s+(the\s+)?chapters?)\b/i,
  /\b(autonomously|automatically|on\s+your\s+own)\b/i,
  /\b(step\s+by\s+step|one\s+by\s+one)\b/i,
  /\b(do\s+everything|handle\s+everything|take\s+care\s+of\s+everything)\b/i,
];

const EDIT_PATTERNS = [
  /\b(rewrite|revise|edit|fix|improve|polish|clean\s+up|rephrase|tighten)\b/i,
  /\b(make\s+(this|it|the)\s+(shorter|longer|better|clearer|more))\b/i,
  /\b(replace|swap|change\s+this|update\s+(this|the\s+chapter))\b/i,
  /\b(add\s+(a\s+)?(paragraph|sentence|section|chapter))\b/i,
  /\b(write\s+(a\s+)?(new\s+)?(chapter|section|paragraph))\b/i,
  /\b(create\s+(a\s+)?(new\s+)?chapter)\b/i,
  /\b(expand|shorten|condense)\b/i,
];

const ASK_PATTERNS = [
  /\b(what|why|how|when|where|who|which)\b/i,
  /\b(explain|describe|tell\s+me|can\s+you|what\s+do\s+you\s+think)\b/i,
  /\b(suggest|recommend|advise|give\s+me\s+(ideas?|feedback|thoughts?))\b/i,
  /\b(does\s+(this|it)|is\s+(this|it)|are\s+there|should\s+I)\b/i,
  /\b(brainstorm|ideas?\s+for|thoughts?\s+on)\b/i,
  /\b(feedback|critique|thoughts?|opinion|review)\b/i,
];

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.filter((p) => p.test(text)).length;
}

export type IntentClassification = {
  suggestedMode: ChatMode;
  confidence: "high" | "medium" | "low";
};

/**
 * Classify a message into a suggested chat mode.
 * Returns `null` when the message is ambiguous (no clear signal).
 */
export function classifyIntent(message: string): IntentClassification | null {
  const agentScore = countMatches(AGENT_PATTERNS, message);
  const editScore = countMatches(EDIT_PATTERNS, message);
  const askScore = countMatches(ASK_PATTERNS, message);

  const max = Math.max(agentScore, editScore, askScore);
  if (max === 0) return null;

  if (agentScore === max) {
    return {
      suggestedMode: "agent",
      confidence: agentScore >= 2 ? "high" : "medium",
    };
  }
  if (editScore === max) {
    return {
      suggestedMode: "edit",
      confidence: editScore >= 2 ? "high" : "medium",
    };
  }
  return {
    suggestedMode: "ask",
    confidence: askScore >= 2 ? "high" : "low",
  };
}

/**
 * Returns a short nudge string if the suggested mode differs from the current mode,
 * or `null` when no nudge is warranted.
 */
export function getModeNudge(
  message: string,
  currentMode: ChatMode,
): { suggestedMode: ChatMode; label: string } | null {
  const classification = classifyIntent(message);
  if (!classification) return null;
  if (classification.suggestedMode === currentMode) return null;
  if (classification.confidence === "low") return null;

  const labels: Record<ChatMode, string> = {
    ask: "Ask",
    edit: "Edit",
    agent: "Agent",
  };

  return {
    suggestedMode: classification.suggestedMode,
    label: labels[classification.suggestedMode],
  };
}
