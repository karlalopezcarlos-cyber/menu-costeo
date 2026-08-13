"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createStoreOrder,
  calculateDeliveryFee,
  calculateDeliveryFeeFromCoords,
  suggestDeliveryAddress,
  getAvailableDeliverySlots,
  type CreateStoreOrderState,
  type DeliverySlotOption,
} from "../actions";
import { formatMoney } from "@/lib/format";
import MapPinPicker from "@/components/MapPinPicker";
import AddressSuggestInput, { type AddressSuggestion } from "@/components/AddressSuggestInput";
import DeliveryCalendar from "./DeliveryCalendar";

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  hasPhoto: boolean;
  categoryName: string | null;
};

type DateOption = { value: string; label: string };

type View = "menu" | "checkout" | "success";
type Fulfillment = "pickup" | "delivery";

const checkoutInitialState: CreateStoreOrderState = {};

export default function StoreApp({
  slug,
  businessName,
  hasLogo,
  menuItems,
  canDeliver,
  deliveryMinOrder,
  deliveryMaxKm,
  deliveryLeadDays,
  hasTimeSlots,
  availableDates,
  pickupAddress,
  pickupLat,
  pickupLng,
}: {
  slug: string;
  businessName: string;
  hasLogo: boolean;
  menuItems: MenuItem[];
  canDeliver: boolean;
  deliveryMinOrder: number;
  deliveryMaxKm: number;
  deliveryLeadDays: number;
  hasTimeSlots: boolean;
  availableDates: DateOption[];
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
}) {
  const [view, setView] = useState<View>("menu");
  const [cart, setCart] = useState<Record<string, number>>({});
  // Fase 2: solo se acepta pago con tarjeta en linea (sin opcion de pagar al recoger).
  const paymentMethod = "card_online" as const;
  const [fulfillmentType, setFulfillmentType] = useState<Fulfillment>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [requestedDeliveryTime, setRequestedDeliveryTime] = useState("");
  const [deliveryPreview, setDeliveryPreview] = useState<{ distanceKm: number; fee: number; placeName: string } | null>(
    null,
  );
  const [deliveryCalculating, setDeliveryCalculating] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [slotOptions, setSlotOptions] = useState<DeliverySlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [state, formAction, pending] = useActionState(createStoreOrder, checkoutInitialState);

  // Si el pago fue con tarjeta, el pedido ya se registro pero falta pagar: se manda al cliente
  // directo al checkout de Mercado Pago. Si fue "pagar al recoger", ya no hay nada mas que hacer,
  // se muestra la confirmacion aqui mismo.
  useEffect(() => {
    if (state.paymentLink) {
      window.location.href = state.paymentLink;
    } else if (state.folioLabel && !state.error) {
      setView("success");
    }
  }, [state]);

  // Al elegir/cambiar el dia de entrega se piden los horarios disponibles para ese dia; el
  // horario elegido antes ya no aplica porque puede que ni siquiera exista para el nuevo dia.
  useEffect(() => {
    setRequestedDeliveryTime("");
    if (!hasTimeSlots || !requestedDeliveryDate) {
      setSlotOptions([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getAvailableDeliverySlots(slug, requestedDeliveryDate).then((slots) => {
      if (!cancelled) {
        setSlotOptions(slots);
        setSlotsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, hasTimeSlots, requestedDeliveryDate]);

  const itemById = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);

  const groups = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      const key = item.categoryName ?? "Menu";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [menuItems]);

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const item = itemById.get(id);
          return item ? { item, qty } : null;
        })
        .filter((l): l is { item: MenuItem; qty: number } => !!l),
    [cart, itemById],
  );

  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.qty * l.item.price, 0);
  const deliveryFee = fulfillmentType === "delivery" ? deliveryPreview?.fee ?? 0 : 0;
  const grandTotal = cartTotal + deliveryFee;
  const underMinimum = fulfillmentType === "delivery" && cartTotal < deliveryMinOrder;

  const rowsPayload = useMemo(
    () => JSON.stringify(cartLines.map((l) => ({ recipeId: l.item.id, quantity: String(l.qty) }))),
    [cartLines],
  );

  async function handleCalculateDelivery() {
    if (!deliveryAddress.trim()) return;
    setDeliveryCalculating(true);
    setDeliveryError(null);
    const result = await calculateDeliveryFee(slug, deliveryAddress);
    if (result.error || result.fee === undefined || result.distanceKm === undefined) {
      setDeliveryError(result.error ?? "No se pudo calcular el envio.");
      setPin(null);
    } else {
      setDeliveryPreview({ distanceKm: result.distanceKm, fee: result.fee, placeName: result.placeName ?? deliveryAddress });
      if (result.lat !== undefined && result.lng !== undefined) setPin({ lat: result.lat, lng: result.lng });
    }
    setDeliveryCalculating(false);
  }

  // Al arrastrar el pin se recalcula el envio con la posicion exacta (mas precisa que el texto), y
  // se actualiza el campo de direccion con la geocodificacion inversa de esa posicion, para que no
  // se quede un texto desalineado de donde realmente va a llegar el repartidor.
  async function handlePinChange(lat: number, lng: number) {
    setPin({ lat, lng });
    const result = await calculateDeliveryFeeFromCoords(slug, lat, lng);
    if (result.error || result.fee === undefined || result.distanceKm === undefined) {
      setDeliveryError(result.error ?? "No se pudo calcular el envio.");
      setDeliveryPreview(null);
    } else {
      setDeliveryError(null);
      const placeName = result.placeName ?? deliveryAddress;
      setDeliveryPreview({ distanceKm: result.distanceKm, fee: result.fee, placeName });
      if (result.placeName) setDeliveryAddress(result.placeName);
    }
  }

  // El calendario (dia + horario) es obligatorio para ambos tipos de entrega; lo especifico de
  // domicilio (direccion calculada, pedido minimo) solo aplica cuando fulfillmentType es "delivery".
  const canSubmitOrder =
    !!requestedDeliveryDate &&
    (!hasTimeSlots || !!requestedDeliveryTime) &&
    (fulfillmentType === "pickup" || (!!deliveryPreview && !underMinimum));

  if (view === "success" && state.folioLabel) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 className="text-2xl font-semibold text-neutral-900">¡Pedido recibido!</h1>
        <p className="text-neutral-600">
          Tu folio es <strong className="text-neutral-900">{state.folioLabel}</strong>.{" "}
          {fulfillmentType === "delivery"
            ? "Te lo llevamos el dia que elegiste."
            : "Pasa a recogerlo el dia que elegiste."}
        </p>
        <button
          type="button"
          onClick={() => {
            setCart({});
            setView("menu");
            setFulfillmentType("pickup");
            setDeliveryAddress("");
            setRequestedDeliveryDate("");
            setRequestedDeliveryTime("");
            setDeliveryPreview(null);
            setPin(null);
          }}
          className="mt-4 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Hacer otro pedido
        </button>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <div className="mx-auto min-h-screen max-w-lg px-4 pb-10 pt-6">
        <button
          type="button"
          onClick={() => setView("menu")}
          className="mb-4 text-sm text-neutral-500 hover:underline"
        >
          ← Seguir viendo el menu
        </button>

        <h1 className="mb-4 text-xl font-semibold text-neutral-900">Tu pedido</h1>

        <div className="space-y-3">
          {cartLines.map(({ item, qty }) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
              <div>
                <p className="font-medium text-neutral-900">{item.name}</p>
                <p className="text-sm text-neutral-500">{formatMoney(item.price)} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <QtyStepper value={qty} onChange={(q) => setQty(item.id, q)} />
              </div>
            </div>
          ))}
        </div>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="rows" value={rowsPayload} />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <input type="hidden" name="fulfillmentType" value={fulfillmentType} />
          <input type="hidden" name="deliveryAddress" value={deliveryAddress} />
          <input type="hidden" name="requestedDeliveryDate" value={requestedDeliveryDate} />
          <input type="hidden" name="requestedDeliveryTime" value={requestedDeliveryTime} />
          <input type="hidden" name="deliveryLat" value={pin?.lat ?? ""} />
          <input type="hidden" name="deliveryLng" value={pin?.lng ?? ""} />
          <input type="hidden" name="origin" value={typeof window !== "undefined" ? window.location.origin : ""} />

          <div className="space-y-1">
            <label htmlFor="customerName" className="text-sm font-medium text-neutral-700">
              Tu nombre
            </label>
            <input
              id="customerName"
              name="customerName"
              required
              placeholder="¿A nombre de quien va el pedido?"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="customerPhone" className="text-sm font-medium text-neutral-700">
              Telefono
            </label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              required
              placeholder="10 digitos"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-neutral-500">
              Lo necesitamos por si hay alguna duda con tu pedido. Espera nuestra confirmacion por
              este medio.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
              Comentarios (opcional)
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={2}
              placeholder="Instrucciones especiales, alergias, etc."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="packagingNotes" className="text-sm font-medium text-neutral-700">
              ¿Es para varias personas? Arma tus paquetes (opcional)
            </label>
            <textarea
              id="packagingNotes"
              name="packagingNotes"
              rows={3}
              placeholder={"Ej:\nMARIANA: 2 de camaron + 1 de pollo\nJORGE: 5 de camaron"}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-neutral-500">
              Si tu pedido se reparte entre varias personas, escribe aqui como va cada paquete para
              que te lo entreguemos ya separado.
            </p>
          </div>

          {canDeliver ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">¿Como lo quieres?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFulfillmentType("pickup")}
                  className={`rounded-lg border p-3 text-sm font-medium ${
                    fulfillmentType === "pickup" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700"
                  }`}
                >
                  Recoger en tienda
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType("delivery")}
                  className={`rounded-lg border p-3 text-sm font-medium ${
                    fulfillmentType === "delivery" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700"
                  }`}
                >
                  Envio a domicilio
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
              Recoges tu pedido directamente en tienda.
            </div>
          )}

          {fulfillmentType === "pickup" && pickupAddress && (
            <PickupLocationCard address={pickupAddress} lat={pickupLat} lng={pickupLng} />
          )}

          {fulfillmentType === "delivery" && (
            <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
              {(deliveryMinOrder > 0 || deliveryMaxKm > 0 || deliveryLeadDays > 0) && (
                <div className="space-y-1 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
                  {deliveryMinOrder > 0 && <p>🛒 Pedido minimo: {formatMoney(deliveryMinOrder)}</p>}
                  {deliveryMaxKm > 0 && <p>📍 Solo hacemos entregas hasta {deliveryMaxKm} km a la redonda.</p>}
                  {deliveryLeadDays > 0 && (
                    <p>
                      🗓️ Agenda tu pedido con al menos {deliveryLeadDays} dia{deliveryLeadDays === 1 ? "" : "s"} de
                      anticipacion.
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="deliveryAddress" className="text-sm font-medium text-neutral-700">
                  Direccion de entrega
                </label>
                <div className="flex gap-2">
                  <AddressSuggestInput
                    id="deliveryAddress"
                    value={deliveryAddress}
                    onChange={(value) => {
                      // Si el cliente edita el texto a mano, el pin/preview anteriores ya no
                      // corresponden a esta direccion nueva -- hay que volver a "Calcular" o elegir
                      // una sugerencia.
                      setDeliveryAddress(value);
                      setDeliveryPreview(null);
                      setPin(null);
                    }}
                    onSelect={(suggestion: AddressSuggestion) => {
                      setDeliveryAddress(suggestion.placeName);
                      handlePinChange(suggestion.lat, suggestion.lng);
                    }}
                    suggestFn={suggestDeliveryAddress}
                    placeholder="Calle, numero, colonia"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleCalculateDelivery}
                    disabled={deliveryCalculating || !deliveryAddress.trim()}
                    className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {deliveryCalculating ? "Calculando..." : "Calcular"}
                  </button>
                </div>
                {deliveryError && <p className="text-sm text-red-600">{deliveryError}</p>}
                {deliveryPreview && (
                  <p className="text-sm text-emerald-700">
                    {deliveryPreview.distanceKm.toFixed(1)} km · Envio: {formatMoney(deliveryPreview.fee)}
                  </p>
                )}
              </div>

              {pin && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-neutral-700">Ubicacion exacta</p>
                  <MapPinPicker lat={pin.lat} lng={pin.lng} onChange={handlePinChange} height={220} />
                </div>
              )}

              {underMinimum && (
                <p className="text-sm text-amber-700">
                  El pedido minimo para envio a domicilio es {formatMoney(deliveryMinOrder)} (te faltan{" "}
                  {formatMoney(deliveryMinOrder - cartTotal)}).
                </p>
              )}
            </div>
          )}

          {/* El calendario aplica igual para recoger en tienda que para domicilio -- ambos son
              pedidos programados sobre el mismo calendario que configura el dueno. */}
          <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-neutral-700">
                {fulfillmentType === "delivery" ? "Dia de entrega" : "Dia para recoger"}
              </p>
              <DeliveryCalendar
                availableDates={availableDates}
                value={requestedDeliveryDate}
                onChange={setRequestedDeliveryDate}
              />
            </div>

            {hasTimeSlots && requestedDeliveryDate && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-neutral-700">
                  {fulfillmentType === "delivery" ? "Horario de entrega" : "Horario para recoger"}
                </p>
                {slotsLoading ? (
                  <p className="text-sm text-neutral-500">Buscando horarios...</p>
                ) : slotOptions.length === 0 ? (
                  <p className="text-sm text-neutral-500">No hay horarios disponibles para ese dia.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slotOptions.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setRequestedDeliveryTime(slot.time)}
                        className={`rounded-lg border px-2 py-2 text-sm font-medium ${
                          requestedDeliveryTime === slot.time
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : slot.available
                              ? "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                              : "cursor-not-allowed border-neutral-200 text-neutral-300 line-through"
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-neutral-200 pt-4">
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <span>Subtotal</span>
              <span>{formatMoney(cartTotal)}</span>
            </div>
            {fulfillmentType === "delivery" && (
              <div className="flex items-center justify-between text-sm text-neutral-600">
                <span>Envio</span>
                <span>{formatMoney(deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-semibold text-neutral-900">
              <span>Total</span>
              <span>{formatMoney(grandTotal)}</span>
            </div>
          </div>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || cartLines.length === 0 || !canSubmitOrder}
            className="w-full rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Generando link de pago..." : "Ir a pagar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-8 text-center">
          {hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/store/logo/${slug}`}
              alt={businessName}
              className="h-20 w-20 rounded-full object-cover shadow-sm"
            />
          )}
          <h1 className="text-2xl font-bold text-neutral-900">{businessName}</h1>
          <p className="text-sm text-neutral-500">
            {canDeliver ? "Pide en linea, recoge en tienda o pide a domicilio" : "Pide en linea y recoge en tienda"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        {menuItems.length === 0 && (
          <p className="py-16 text-center text-neutral-400">Todavia no hay platillos disponibles.</p>
        )}
        {groups.map(([categoryName, items]) => (
          <section key={categoryName} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{categoryName}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  qty={cart[item.id] ?? 0}
                  onChange={(q) => setQty(item.id, q)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => setView("checkout")}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-full bg-neutral-900 px-5 py-3.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <span>
              {cartCount} platillo{cartCount === 1 ? "" : "s"}
            </span>
            <span>Ver pedido · {formatMoney(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function PickupLocationCard({
  address,
  lat,
  lng,
}: {
  address: string;
  lat: number | null;
  lng: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const mapsHref = lat != null && lng != null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (navegador viejo o contexto no seguro): no pasa nada, el
      // cliente igual puede seleccionar y copiar el texto a mano.
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-medium text-neutral-700">📍 Recoges tu pedido en:</p>
      <p className="text-sm text-neutral-600">{address}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {copied ? "¡Copiada!" : "Copiar direccion"}
        </button>
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Ver en el mapa
          </a>
        )}
      </div>
    </div>
  );
}

function MenuCard({
  item,
  qty,
  onChange,
}: {
  item: MenuItem;
  qty: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="h-64 w-full shrink-0 bg-neutral-100 sm:h-72">
        {item.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/store/photo/${item.id}`} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-neutral-300">🍽️</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-semibold text-neutral-900">{item.name}</h3>
        {item.description && <p className="text-sm text-neutral-500">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-base font-semibold text-neutral-900">{formatMoney(item.price)}</span>
          <QtyStepper value={qty} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

function QtyStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  if (value === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Agregar
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-full border border-neutral-300 px-2 py-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
      >
        −
      </button>
      <span className="w-4 text-center text-sm font-medium">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
      >
        +
      </button>
    </div>
  );
}
