import type { StrategyTopic } from "./types";
import { tarikhTopic } from "./topics/tarikh";

export const strategyTopics: StrategyTopic[] = [tarikhTopic];

export function getStrategyTopic(id: string): StrategyTopic | undefined {
  return strategyTopics.find((t) => t.id === id);
}

export { CHANNEL_FA, stars } from "./types";
export type { StrategyTopic } from "./types";
