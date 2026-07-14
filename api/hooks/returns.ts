import { useMedusaSdk } from '@/contexts/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type PosReturnResponse = {
  return_id: string;
  refund_amount: number;
  credit_note_pdf_url: string | null;
};

// THA-13. A POS return is a single atomic action from the salesperson's
// point of view - the backend's .../pos-return route chains Medusa's
// return-request/receive workflow (which restocks inventory), a refund on
// whichever provider captured the original payment, and a Moloni credit
// note reconciled against the original invoice.
export const useCreateReturn = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['returns', 'create'],
    mutationFn: async (input: { orderId: string; items: { item_id: string; quantity: number }[] }) => {
      return sdk.client.fetch<PosReturnResponse>(`/admin/orders/${input.orderId}/pos-return`, {
        method: 'POST',
        body: { items: input.items },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', 'order', variables.orderId] });
    },
  });
};
