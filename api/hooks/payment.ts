import { useMedusaSdk } from '@/contexts/auth';
import { useMutation, useQuery } from '@tanstack/react-query';

export type SumupTerminal = {
  id: string;
  reader_id: string;
  name: string;
  stock_location_id: string;
  status: 'paired' | 'unpaired';
};

// THA-10/THA-11. Lists SumUp readers registered for a stock location, so
// the salesperson can pick which terminal to charge from.
export const useSumupTerminals = (stockLocationId: string | undefined) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['sumup-terminals', stockLocationId],
    queryFn: async () => {
      const res = await sdk.client.fetch<{ sumup_terminals: SumupTerminal[] }>('/admin/sumup-terminals', {
        query: stockLocationId ? { stock_location_id: stockLocationId } : undefined,
      });
      return res.sumup_terminals;
    },
    enabled: !!stockLocationId,
  });
};

type PaymentSessionStatus = 'pending' | 'requires_more' | 'authorized' | 'captured' | 'canceled' | 'error';

type PaymentCollectionResponse = {
  payment_collection: {
    id: string;
    payment_sessions?: { id: string; provider_id: string; status: PaymentSessionStatus; data?: Record<string, unknown> }[];
  };
};

type PaymentCollectionStatusResponse = {
  payment_sessions: { id: string; provider_id: string; status: PaymentSessionStatus; data?: Record<string, unknown> }[];
};

// Starts a terminal charge: creates a payment collection for the order
// (draft orders share the order table in Medusa v2, so the draft order id
// works directly), then a payment session on the "sumup" provider with the
// chosen reader - this triggers initiatePayment on the backend, which
// tells the physical/virtual reader to display the amount.
export const useStartTerminalCharge = () => {
  const sdk = useMedusaSdk();

  return useMutation({
    mutationKey: ['payment', 'start-terminal-charge'],
    mutationFn: async (input: { orderId: string; amount: number; readerId: string }) => {
      const { payment_collection } = await sdk.admin.paymentCollection.create({
        order_id: input.orderId,
        amount: input.amount,
      });

      const result = await sdk.client.fetch<PaymentCollectionResponse>(
        `/admin/payment-collections/${payment_collection.id}/payment-sessions`,
        {
          method: 'POST',
          body: {
            // Medusa registers custom payment providers under
            // pp_{class.identifier}_{config.id from medusa-config.ts}, not
            // the bare id - confirmed via the payment_provider entity on
            // the backend. Passing "sumup" alone throws
            // AwilixResolutionError: Could not resolve 'sumup'.
            provider_id: 'pp_sumup_sumup',
            data: { reader_id: input.readerId },
          },
        },
      );

      return result.payment_collection;
    },
  });
};

// Poll target while waiting for the reader's webhook result to land -
// there is no push channel to a mobile client, so this is the practical
// way to notice a completed/failed charge.
//
// Confirmed live 2026-07-06: Medusa v2 core has no GET route at all for a
// single payment collection (/admin/payment-collections/:id only
// implements DELETE) - this was 404ing on every single poll regardless of
// the payment's actual status, which is why charges appeared to hang on
// "Waiting for card..." forever even once the backend correctly authorized
// them. Hits our own custom .../status route instead (see backend's
// api/admin/payment-collections/[id]/status/route.ts).
export const usePaymentCollectionStatus = (paymentCollectionId: string | undefined, enabled: boolean) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['payment-collection', paymentCollectionId],
    queryFn: async () => {
      const result = await sdk.client.fetch<PaymentCollectionStatusResponse>(
        `/admin/payment-collections/${paymentCollectionId}/status`,
      );
      return result;
    },
    enabled: enabled && !!paymentCollectionId,
    refetchInterval: (query) => {
      const status = query.state.data?.payment_sessions?.[0]?.status;
      if (status === 'authorized' || status === 'captured' || status === 'canceled' || status === 'error') {
        return false;
      }
      return 2000;
    },
  });
};

// Cancels an in-flight terminal charge (customer walked away, salesperson
// tapped Cancel) - deletePayment on the provider terminates the reader
// checkout, per THA-10.
export const useCancelTerminalCharge = () => {
  const sdk = useMedusaSdk();

  return useMutation({
    mutationKey: ['payment', 'cancel-terminal-charge'],
    mutationFn: async (paymentCollectionId: string) => {
      await sdk.admin.paymentCollection.delete(paymentCollectionId);
    },
  });
};
