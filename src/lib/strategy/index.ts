import type { StrategyTopic } from "./types";
import { tarikhTopic } from "./topics/tarikh";
import { radarTopic } from "./topics/radar";
import { tarikhMoaserTopic } from "./topics/tarikh-moaser";

export const strategyTopics: StrategyTopic[] = [radarTopic, tarikhTopic, tarikhMoaserTopic];

export function getStrategyTopic(id: string): StrategyTopic | undefined {
  return strategyTopics.find((t) => t.id === id);
}

export { CHANNEL_FA, stars } from "./types";
export type { StrategyTopic } from "./types";
