import {
  useCancelTerminalCharge,
  usePaymentCollectionStatus,
  useStartTerminalCharge,
  useSumupTerminals,
} from '@/api/hooks/payment';
import { useCompleteDraftOrder, useDraftOrderOrOrder } from '@/api/hooks/draft-orders';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { showErrorToast } from '@/utils/errors';
import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

// THA-10/THA-11. Terminal charge step, inserted between the cart and order
// completion: pick a reader → tell it to display the amount → wait for the
// async webhook result (there's no push channel to a mobile client, so
// this polls) → only then convert the draft order into a real order.
export default function PaymentScreen() {
  const { draftOrderId } = useLocalSearchParams<{ draftOrderId: string }>();
  const settings = useSettings();
  const draftOrder = useDraftOrderOrOrder(draftOrderId);
  const terminals = useSumupTerminals(settings.data?.stock_location?.id);
  const startCharge = useStartTerminalCharge();
  const cancelCharge = useCancelTerminalCharge();
  const completeOrder = useCompleteDraftOrder(draftOrderId);

  const [paymentCollectionId, setPaymentCollectionId] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);

  const paymentStatus = usePaymentCollectionStatus(paymentCollectionId ?? undefined, !!paymentCollectionId);
  const session = paymentStatus.data?.payment_sessions?.[0];

  React.useEffect(() => {
    if (!session) return;

    if (session.status === 'authorized' || session.status === 'captured') {
      completeOrder.mutate(undefined, {
        onSuccess: () => {
          router.replace({ pathname: '/checkout/[draftOrderId]', params: { draftOrderId } });
        },
        onError: () => {
          setFailed('Payment succeeded, but the order could not be completed. Check Orders and retry manually.');
        },
      });
    } else if (session.status === 'canceled' || session.status === 'error') {
      setFailed('The payment was declined or canceled on the terminal.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  const total = draftOrder.data?.total ?? 0;
  const currency = draftOrder.data?.region?.currency_code || settings.data?.region?.currency_code;

  const handleChargeTerminal = (readerId: string) => {
    setFailed(null);
    startCharge.mutate(
      { orderId: draftOrderId, amount: total, readerId },
      {
        onSuccess: (paymentCollection) => {
          setPaymentCollectionId(paymentCollection.id);
        },
        onError: (error) => {
          showErrorToast(error);
        },
      },
    );
  };

  const handleCancel = () => {
    if (paymentCollectionId) {
      cancelCharge.mutate(paymentCollectionId, {
        onSettled: () => {
          setPaymentCollectionId(null);
          setFailed(null);
        },
      });
    } else {
      router.back();
    }
  };

  const isWaiting = !!paymentCollectionId && !failed && session?.status !== 'authorized' && session?.status !== 'captured';

  return (
    <Layout>
      <Text className="mb-6 text-4xl">Charge</Text>

      <View className="mb-8 items-center">
        <Text className="text-gray-400">Amount due</Text>
        <Text className="text-5xl">
          {total.toLocaleString('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })}
        </Text>
      </View>

      {failed && (
        <InfoBanner variant="ghost" colorScheme="error" className="mb-6">
          {failed}
        </InfoBanner>
      )}

      {isWaiting ? (
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator size="large" />
          <Text className="text-xl">Waiting for card...</Text>
          <Text className="text-center text-gray-300">Ask the customer to tap, insert, or swipe their card.</Text>
        </View>
      ) : (
        <View className="flex-1 gap-3">
          <Text className="mb-2 text-xl">Choose a terminal</Text>
          {terminals.isLoading && <ActivityIndicator />}
          {terminals.isSuccess && terminals.data.length === 0 && (
            <InfoBanner variant="ghost" colorScheme="warning">
              No SumUp terminals are registered for this stock location.
            </InfoBanner>
          )}
          {terminals.data?.map((terminal) => (
            <Button
              key={terminal.id}
              variant="outline"
              onPress={() => handleChargeTerminal(terminal.reader_id)}
              isPending={startCharge.isPending}
            >
              {terminal.name}
            </Button>
          ))}
        </View>
      )}

      <View className="pb-safe flex-row gap-2 pt-4">
        <Button variant="outline" className="flex-1" onPress={handleCancel} isPending={cancelCharge.isPending}>
          Cancel
        </Button>
      </View>
    </Layout>
  );
}
