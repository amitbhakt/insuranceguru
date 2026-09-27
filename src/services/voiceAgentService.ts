export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type AgentState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";
export type VoiceMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  isPartial?: boolean;
  isInterrupted?: boolean;
  timestamp: Date;
};

export type VoiceMetrics = {
  ttfa: number;
  vadMs: number;
  sttMs: number;
  llmMs: number;
  ttsMs: number;
};

export const openingMessages: VoiceMessage[] = [
  {
    id: "welcome",
    role: "agent",
    text: "Hello, welcome to Arogya Shield. I can help you explore health cover or answer a question about a policy.",
    timestamp: new Date(Date.now() - 180000),
  },
  {
    id: "sample-question",
    role: "user",
    text: "What is covered under a family health plan?",
    timestamp: new Date(Date.now() - 115000),
  },
  {
    id: "sample-answer",
    role: "agent",
    text: "A family plan can cover eligible hospitalisation expenses for everyone listed. Benefits, limits and waiting periods depend on the specific policy schedule.",
    timestamp: new Date(Date.now() - 90000),
  },
];

const policyAnswers: Array<{ includes: string[]; answer: string }> = [
  {
    includes: ["waiting period", "pre-existing", "preexisting", "diabetes"],
    answer:
      "Waiting periods for pre-existing conditions vary by policy and are listed in the policy schedule. I can help you find that section; please check your issued policy for the terms that apply to you.",
  },
  {
    includes: ["claim", "cashless", "hospital"],
    answer:
      "For a cashless claim, contact your insurer or the hospital insurance desk before planned admission. Eligibility, documents and limits are set out in your policy schedule.",
  },
  {
    includes: ["premium", "price", "cost", "monthly"],
    answer:
      "Your premium depends on the people insured, ages, cover amount and selected benefits. The exact amount appears in your personalised quote or policy schedule.",
  },
  {
    includes: ["parent", "parents", "dependent", "add"],
    answer:
      "Eligibility to add a parent depends on the plan and each member's age. Check the current product brochure or ask an advisor to confirm the available options.",
  },
  {
    includes: ["cover", "covered", "benefit", "family", "plan"],
    answer:
      "A family health plan may cover eligible hospitalisation and related expenses, subject to the plan's limits, exclusions and waiting periods. Your policy schedule has the exact benefits.",
  },
];

export function createPolicyAnswer(question: string): string {
  const normalized = question.toLowerCase();
  return (
    policyAnswers.find((entry) => entry.includes.some((keyword) => normalized.includes(keyword)))
      ?.answer ??
    "I can help with benefits, claims, premiums and waiting periods. For a decision about your cover, please confirm the terms in your policy schedule or with an Arogya Shield advisor."
  );
}

export function formatMessageTime(timestamp: Date): string {
  return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}