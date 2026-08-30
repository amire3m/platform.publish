// Minimal youtube dimension client for Task 1.
// Real implementation would call YouTube Analytics API with dimension queries.
// For now exports stubs that tests can mock via vi.mock.
export type TrafficRow = { trafficSourceType: string; views: number };
export type AudienceRow = { ageGroup?: string; gender?: string; views: number };
export type GeoRow = { country: string; views: number };
export type DeviceRow = { deviceType: string; views: number };
export type SearchRow = { searchTerm: string; views: number };
export type RetentionRow = { videoId: string; averageViewDuration: number; retentionRate?: number };
export type RevenueRow = { date: string; estimatedRevenue: number; cpm?: number };

export async function fetchTraffic(_range: { start: Date; end: Date } | unknown, _accountId?: string): Promise<TrafficRow[]> {
  return [];
}

export async function fetchAudience(_range: unknown, _accountId?: string): Promise<AudienceRow[]> {
  return [];
}

export async function fetchGeo(_range: unknown, _accountId?: string): Promise<GeoRow[]> {
  return [];
}

export async function fetchDevice(_range: unknown, _accountId?: string): Promise<DeviceRow[]> {
  return [];
}

export async function fetchSearch(_range: unknown, _accountId?: string): Promise<SearchRow[]> {
  return [];
}

export async function fetchRetention(_range: unknown, _accountId?: string): Promise<RetentionRow[]> {
  return [];
}

export async function fetchRevenue(_range: unknown, _accountId?: string): Promise<RevenueRow[]> {
  return [];
}
