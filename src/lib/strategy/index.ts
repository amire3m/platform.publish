import type { StrategyTopic } from "./types";
import { tarikhTopic } from "./topics/tarikh";
import { tarikhIndexTopic } from "./topics/tarikh-index";
import { radarTopic } from "./topics/radar";
import { tarikhMoaserTopic } from "./topics/tarikh-moaser";
import { hooshTopic } from "./topics/hoosh";
import { ketabTopic } from "./topics/ketab";

const allTopics: StrategyTopic[] = [radarTopic, tarikhIndexTopic, tarikhTopic, tarikhMoaserTopic, hooshTopic, ketabTopic];

// فقط والدها در فهرست اصلی؛ فرزندها زیر کارت والد.
export const strategyTopics: StrategyTopic[] = allTopics.filter((t) => !t.parentId);

export function getStrategyTopic(id: string): StrategyTopic | undefined {
  return allTopics.find((t) => t.id === id);
}

export function getTopicChildren(parentId: string): StrategyTopic[] {
  return allTopics.filter((t) => t.parentId === parentId);
}

export { CHANNEL_FA, stars } from "./types";
export type { StrategyTopic } from "./types";
