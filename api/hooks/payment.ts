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

      try {
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
      } catch (error) {
        // Session creation (triggers our initiatePayment on the backend)
        // can fail after the collection itself was already created - e.g.
        // SumUp's READER_BUSY if a previous checkout is still active.
        // Confirmed live 2026-07-06: when this throws, this whole mutation
        // rejects before onSuccess ever runs, so the caller's component
        // state never learns this collection's id and can't clean it up on
        // the next retry - it was piling up as a permanent orphan dragging
        // the order's aggregate payment status down to
        // "partially authorized". Clean it up right here instead of
        // relying on the caller to track an id it never received.
        await sdk.client
          .fetch(`/admin/payment-collections/${payment_collection.id}/terminal-charge`, { method: 'DELETE' })
          .catch(() => {});
        throw error;
      }
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
// tapped Cancel, or a retry needs to clear a previous attempt first).
//
// Confirmed live 2026-07-06: Medusa's core DELETE /admin/payment-collections/:id
// only unlinks the collection from the order - it never actually terminates
// the checkout on the SumUp reader, so the next retry hit SumUp's
// "READER_BUSY" error for ~40s until the abandoned checkout expired on its
// own. Uses the backend's custom .../terminal-charge route instead, which
// terminates the reader checkout first.
export const useCancelTerminalCharge = () => {
  const sdk = useMedusaSdk();

  return useMutation({
    mutationKey: ['payment', 'cancel-terminal-charge'],
    mutationFn: async (paymentCollectionId: string) => {
      await sdk.client.fetch(`/admin/payment-collections/${paymentCollectionId}/terminal-charge`, {
        method: 'DELETE',
      });
    },
  });
};
