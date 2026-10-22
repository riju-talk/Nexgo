// Everything a real courier needs to create a shipment. Gathered once per booking (lib/bookingDetails.ts); the mock adapter ignores it.
export type BookingDetails = {
  sellerName: string; orderNumber: string; nexgoOrderId: string;
  /** The courier's own id for the chosen service (courier_services.external_service_id). */
  externalServiceId: string | null;
  /** The courier-side pickup address for this warehouse, once one exists (courier_pickup_hubs). */
  pickupHubId: string | null;
  warehouse: { id: string; name: string; contactName: string; phone: string; email: string | null; address1: string; address2: string | null; city: string; state: string; pincode: string };
  consignee: { name: string; phone: string; email: string | null; address1: string; address2: string | null; landmark: string | null; city: string; state: string; pincode: string };
  items: { name: string; sku: string; quantity: number; unitPricePaise: number; weightG: number }[];
  package: { weightG: number; lengthMm: number | null; widthMm: number | null; heightMm: number | null; volumetricWeightG: number };
};
export type CourierBookingRequest = { reference: string; destinationPincode: string; weightG: number; paymentMode: 'prepaid' | 'cod'; codAmountPaise: number; details?: BookingDetails };
export type CourierBookingResult = {
  providerShipmentId: string; awb: string; labelAvailable: boolean;
  /** The courier's sort / routing code for the label, when the courier gives one. */
  routingCode?: string;
  /** Set when the adapter had to create the pickup address; the caller remembers it for the next booking. */
  pickupHubId?: string;
};
export type CourierAdapter = {
  providerCode: string;
  book(request: CourierBookingRequest): Promise<CourierBookingResult>;
  cancel(providerShipmentId: string): Promise<void>;
};
