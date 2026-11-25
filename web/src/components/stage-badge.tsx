import { STATE_LABEL, type StageState } from "@/lib/pipeline";
import { Badge } from "./ui";

const TONE: Record<StageState, "neutral" | "indigo" | "pine" | "ochre" | "plum"> = {
  locked: "neutral",
  ready: "indigo",
  generating: "indigo",
  pending_review: "ochre",
  approved: "pine",
  stale: "plum",
  rejected: "plum",
  failed: "plum",
};

export function StageBadge({ state }: { state: StageState }) {
  return <Badge tone={TONE[state]}>{STATE_LABEL[state]}</Badge>;
}
