"use client";

import { useActionState, useState } from "react";
import { updateBusinessLocation, previewBusinessAddress, previewLocationFromCoords, suggestBusinessAddress } from "./actions";
import MapPinPicker from "@/components/MapPinPicker";
import AddressSuggestInput, { type AddressSuggestion } from "@/components/AddressSuggestInput";

const initialState: { error?: string; success?: boolean } = {};

export default function BusinessLocationForm({
  businessAddress,
  businessLat,
  businessLng,
}: {
  businessAddress: string;
  businessLat: number | null;
  businessLng: number | null;
}) {
  const [state, formAction, pending] = useActionState(updateBusinessLocation, initialState);
  const [address, setAddress] = useState(businessAddress);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    businessLat != null && businessLng != null ? { lat: businessLat, lng: businessLng } : null,
  );
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  async function handleLocate() {
    if (!address.trim()) return;
    setLocating(true);
    setLocateError(null);
    const result = await previewBusinessAddress(address);
    if (result.error || result.lat === undefined || result.lng === undefined) {
      setLocateError(result.error ?? "No se pudo ubicar esa direccion.");
    } else {
      setPin({ lat: result.lat, lng: result.lng });
      if (result.placeName) setAddress(result.placeName);
    }
    setLocating(false);
  }

  // Al arrastrar el pin, se actualiza el texto de direccion con la geocodificacion inversa de esa
  // posicion exacta, para que no se quede desalineado del punto que realmente se va a guardar.
  async function handlePinChange(lat: number, lng: number) {
    setPin({ lat, lng });
    const result = await previewLocationFromCoords(lat, lng);
    if (result.placeName) setAddress(result.placeName);
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="space-y-1">
        <label htmlFor="businessAddress" className="text-sm font-medium text-neutral-700">
          Direccion de tu negocio (punto de partida para los envios)
        </label>
        <div className="flex gap-2">
          <AddressSuggestInput
            id="businessAddress"
            name="businessAddress"
            value={address}
            onChange={setAddress}
            onSelect={(suggestion: AddressSuggestion) => {
              setAddress(suggestion.placeName);
              handlePinChange(suggestion.lat, suggestion.lng);
            }}
            suggestFn={suggestBusinessAddress}
            placeholder="Calle, numero, colonia, ciudad"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating || !address.trim()}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {locating ? "Ubicando..." : "Ubicar en el mapa"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Entre mas detalle le des (numero, colonia), mas precisa sale la ubicacion. Despues puedes
          arrastrar el pin en el mapa para afinarla.
        </p>
        {locateError && <p className="text-sm text-red-600">{locateError}</p>}
      </div>

      {pin && (
        <MapPinPicker lat={pin.lat} lng={pin.lng} onChange={handlePinChange} />
      )}

      <input type="hidden" name="businessLat" value={pin?.lat ?? ""} />
      <input type="hidden" name="businessLng" value={pin?.lng ?? ""} />

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Ubicacion guardada.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar ubicacion"}
      </button>
    </form>
  );
}
