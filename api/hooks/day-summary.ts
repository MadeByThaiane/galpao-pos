import { useMedusaSdk } from '@/contexts/auth';
import { useQuery } from '@tanstack/react-query';

export type DaySummary = {
  date: string;
  currency_code?: string;
  sales_count: number;
  sales_total: number;
  totals_by_provider: Record<string, number>;
  returns_count: number;
  returns_total: number;
};

// THA-13. End-of-day report: sales count, totals by payment rail, and
// returns for the shop's stock location. Defaults to today.
export const useDaySummary = (stockLocationId: string | undefined, date?: string) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['day-summary', stockLocationId, date],
    queryFn: async () => {
      return sdk.client.fetch<DaySummary>('/admin/day-summary', {
        query: { stock_location_id: stockLocationId, date },
      });
    },
    enabled: !!stockLocationId,
  });
};
