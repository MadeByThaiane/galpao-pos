import { useMedusaSdk } from '@/contexts/auth';
import { useQuery } from '@tanstack/react-query';

type MoloniDocumentResponse = {
  moloni_document: {
    document_type: 'simplified_invoice' | 'invoice_receipt';
    pdf_url: string;
    invoiced_at: string;
  };
};

// THA-9/THA-11. Receipt step: the certified fatura simplificada/recibo is
// produced async by the backend's Moloni invoicing subscriber after an
// order is placed, so this may 404 for a few seconds right after checkout
// - retries on an interval until it shows up or the salesperson leaves the
// screen.
export const useMoloniReceipt = (orderId: string | undefined) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['moloni-document', orderId],
    queryFn: async () => {
      const res = await sdk.client.fetch<MoloniDocumentResponse>(`/admin/orders/${orderId}/moloni-document`);
      return res.moloni_document;
    },
    enabled: !!orderId,
    retry: (failureCount, error: any) => {
      if (error?.status === 404) {
        return failureCount < 10;
      }
      return failureCount < 2;
    },
    retryDelay: 3000,
  });
};
