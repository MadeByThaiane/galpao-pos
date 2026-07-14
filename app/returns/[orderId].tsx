import { useCreateReturn } from '@/api/hooks/returns';
import { useOrder } from '@/api/hooks/orders';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Layout } from '@/components/ui/Layout';
import { QuantityPicker } from '@/components/ui/QuantityPicker';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { AdminOrderLineItem } from '@medusajs/types';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Image, View } from 'react-native';

const formatCurrency = (amount: number, currency: string) =>
  amount.toLocaleString('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });

export default function ReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const settings = useSettings();
  const orderQuery = useOrder(orderId);
  const createReturn = useCreateReturn();

  const [selectedQuantities, setSelectedQuantities] = React.useState<Record<string, number>>({});

  const currency =
    orderQuery.data?.order.currency_code ||
    orderQuery.data?.order.region?.currency_code ||
    settings.data?.region?.currency_code ||
    'EUR';

  const items = orderQuery.data?.order.items ?? [];

  const refundPreview = items.reduce((acc, item) => {
    const quantity = selectedQuantities[item.id] ?? 0;
    if (!quantity) return acc;
    return acc + (item.total / item.quantity) * quantity;
  }, 0);

  const hasSelection = Object.values(selectedQuantities).some((quantity) => quantity > 0);

  const renderItem = React.useCallback(
    ({ item }: { item: AdminOrderLineItem }) => {
      const thumbnail = item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;
      const quantity = selectedQuantities[item.id] ?? 0;

      return (
        <View className="flex-row items-center gap-4 bg-white py-6">
          <View className="h-16 w-16 overflow-hidden rounded-xl bg-gray-200">
            {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-cover" />}
          </View>
          <View className="flex-1 gap-1">
            <Text>{item.title}</Text>
            <Text className="text-sm text-gray-300">
              {formatCurrency(item.total / item.quantity, currency)} each · Bought {item.quantity}
            </Text>
          </View>
          <QuantityPicker
            quantity={quantity}
            min={0}
            max={item.quantity}
            onQuantityChange={(newQuantity) => setSelectedQuantities((prev) => ({ ...prev, [item.id]: newQuantity }))}
          />
        </View>
      );
    },
    [currency, selectedQuantities],
  );

  const handleConfirm = () => {
    const returnItems = Object.entries(selectedQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }));

    if (!returnItems.length || !orderId) return;

    createReturn.mutate({ orderId, items: returnItems });
  };

  return (
    <>
      <Layout>
        <Text className="mb-6 text-4xl">Process Return</Text>

        {orderQuery.isLoading ? (
          <Text className="text-gray-300">Loading order...</Text>
        ) : orderQuery.isError ? (
          <InfoBanner colorScheme="error">Failed to load the order.</InfoBanner>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View className="h-hairline bg-gray-200" />}
            ListHeaderComponent={() => <Text className="text-2xl">Select Items to Return</Text>}
            keyboardDismissMode="on-drag"
          />
        )}

        {createReturn.isError && (
          <InfoBanner colorScheme="error" className="mb-4">
            {createReturn.error instanceof Error ? createReturn.error.message : 'Failed to process the return.'}
          </InfoBanner>
        )}

        <View className="mb-6 mt-4 flex-row justify-between border-t border-gray-200 pt-4">
          <Text className="text-lg">Refund Total</Text>
          <Text className="text-lg">{formatCurrency(refundPreview, currency)}</Text>
        </View>

        <View className="pb-safe flex-row gap-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onPress={handleConfirm}
            disabled={!hasSelection}
            isPending={createReturn.isPending}
          >
            Confirm Return
          </Button>
        </View>
      </Layout>

      <Dialog
        visible={createReturn.isSuccess}
        showCloseButton={false}
        dismissOnOverlayPress={false}
        title="Return processed"
        contentClassName="flex-shrink"
      >
        <InfoBanner colorScheme="success" className="mb-4">
          {`Refunded ${formatCurrency(createReturn.data?.refund_amount ?? 0, currency)}. Stock has been restocked and a credit note was issued.`}
        </InfoBanner>

        <Button
          onPress={() => {
            router.back();
          }}
        >
          Done
        </Button>
      </Dialog>
    </>
  );
}
