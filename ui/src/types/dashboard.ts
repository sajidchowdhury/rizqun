/** Dashboard types — mirrors backend dashboard.dto.ts. */

export interface DashboardSummary {
  month: string;
  doneCount: number;
  avgTotalMinutes: number | null;
  avgStepMinutes: {
    pending_to_waiting_vendor: number | null;
    waiting_vendor_to_preparing: number | null;
    preparing_to_picked_up: number | null;
    picked_up_to_delivered: number | null;
  };
}

export interface DailyCountPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DailyAvgTimePoint {
  date: string; // YYYY-MM-DD
  avgMinutes: number | null;
}

export interface CategoryBreakdownPoint {
  categorySlug: string;
  categoryName: string;
  orderCount: number;
}

// Response wrappers
export interface DashboardSummaryResponse {
  month: string;
  doneCount: number;
  avgTotalMinutes: number | null;
  avgStepMinutes: DashboardSummary['avgStepMinutes'];
}

export interface DailyCountResponse {
  data: DailyCountPoint[];
}

export interface DailyAvgTimeResponse {
  data: DailyAvgTimePoint[];
}

export interface CategoryBreakdownResponse {
  data: CategoryBreakdownPoint[];
}
