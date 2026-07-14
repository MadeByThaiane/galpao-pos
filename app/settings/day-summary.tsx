import { useDaySummary } from '@/api/hooks/day-summary';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

const PROVIDER_LABELS: Record<string, string> = {
  pp_sumup_sumup: 'SumUp',
  pp_teya_teya: 'Teya',
};

const formatCurrency = (amount: number, currency: string) =>
  amount.toLocaleString('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });

export default function DaySummaryScreen() {
  const settings = useSettings();
  const stockLocationId = settings.data?.stock_location?.id;
  const summary = useDaySummary(stockLocationId);

  const currency = summary.data?.currency_code || settings.data?.region?.currency_code || 'EUR';

  return (
    <LayoutWithScroll>
      <Text className="mb-6 text-4xl">Day Summary</Text>

      {summary.isLoading || settings.isLoading ? (
        <Text className="text-gray-300">Loading...</Text>
      ) : summary.isError ? (
        <InfoBanner colorScheme="error" className="mb-4">
          Failed to load the day summary.
        </InfoBanner>
      ) : summary.data ? (
        <View className="gap-6">
          <View>
            <Text className="mb-2 text-2xl">Sales</Text>
            <View className="gap-2 rounded-xl border border-gray-200 p-4">
              <View className="flex-row justify-between">
                <Text className="text-gray-300">Orders</Text>
                <Text>{summary.data.sales_count}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-300">Total</Text>
                <Text>{formatCurrency(summary.data.sales_total, currency)}</Text>
              </View>
            </View>
          </View>

          <View>
            <Text className="mb-2 text-2xl">By Payment Rail</Text>
            <View className="gap-2 rounded-xl border border-gray-200 p-4">
              {Object.entries(summary.data.totals_by_provider).length === 0 ? (
                <Text className="text-gray-300">No captured payments yet.</Text>
              ) : (
                Object.entries(summary.data.totals_by_provider).map(([providerId, amount]) => (
                  <View key={providerId} className="flex-row justify-between">
                    <Text className="text-gray-300">{PROVIDER_LABELS[providerId] ?? providerId}</Text>
                    <Text>{formatCurrency(amount, currency)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View>
            <Text className="mb-2 text-2xl">Returns</Text>
            <View className="gap-2 rounded-xl border border-gray-200 p-4">
              <View className="flex-row justify-between">
                <Text className="text-gray-300">Returns</Text>
                <Text>{summary.data.returns_count}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-300">Refunded</Text>
                <Text>{formatCurrency(summary.data.returns_total, currency)}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <Button variant="outline" className="mt-8" onPress={() => router.back()}>
        Back to Settings
      </Button>
    </LayoutWithScroll>
  );
}
