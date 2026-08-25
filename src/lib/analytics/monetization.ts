export interface MonetizationProgress {
  subsProgress: number;
  hoursProgress: number;
  remainingSubs: number;
  remainingHours: number;
  isEligible: boolean;
}

export function calculateMonetizationProgress(subs: number, hours: number): MonetizationProgress {
  return {
    subsProgress: Math.min(subs / 1000, 1),
    hoursProgress: Math.min(hours / 4000, 1),
    remainingSubs: Math.max(1000 - subs, 0),
    remainingHours: Math.max(4000 - hours, 0),
    isEligible: subs >= 1000 && hours >= 4000,
  };
}
