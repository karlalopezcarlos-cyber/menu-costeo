export type GeocodeResult = { lat: number; lng: number; placeName: string };

function requireAccessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "El calculo de envio no esta configurado (falta MAPBOX_ACCESS_TOKEN). Pide al administrador que lo configure.",
    );
  }
  return token;
}

/**
 * Convierte una direccion en texto a coordenadas, usando la API de geocodificacion de Mapbox.
 * Limitado a Mexico (country=mx) para mejorar la precision con direcciones cortas/informales.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const token = requireAccessToken();
  const encoded = encodeURIComponent(address);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=mx&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("No se pudo ubicar esa direccion. Intenta con mas detalle (calle, numero, colonia).");
  }
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature?.center || feature.center.length !== 2) return null;

  const [lng, lat] = feature.center;
  return { lat, lng, placeName: feature.place_name ?? address };
}

/**
 * Convierte coordenadas a una direccion en texto (geocodificacion inversa), usando la API de
 * Mapbox. Se usa para que, al arrastrar el pin en el mapa, el campo de direccion se actualice solo
 * en vez de dejar el texto viejo desalineado con la ubicacion real que se va a usar.
 */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<{ placeName: string } | null> {
  const token = requireAccessToken();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&country=mx&limit=1`;

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature?.place_name) return null;

  return { placeName: feature.place_name };
}

export type AddressSuggestion = { id: string; placeName: string; lat: number; lng: number };

/**
 * Sugerencias de autocompletado mientras el usuario escribe una direccion, usando la misma API de
 * geocodificacion de Mapbox pero con autocomplete=true y varios resultados. Se usa para mostrar un
 * menu desplegable de opciones en vez de obligar a escribir la direccion completa y exacta.
 */
export async function suggestAddress(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const token = requireAccessToken();
  const encoded = encodeURIComponent(trimmed);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=mx&autocomplete=true&limit=5`;

  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  const features = Array.isArray(data?.features) ? data.features : [];

  return features
    .filter((f: { center?: unknown; place_name?: unknown }) => Array.isArray(f.center) && f.center.length === 2)
    .map((f: { id: string; place_name: string; center: [number, number] }) => ({
      id: f.id,
      placeName: f.place_name,
      lat: f.center[1],
      lng: f.center[0],
    }));
}

/**
 * Distancia real por calles (no linea recta) manejando entre dos puntos, en kilometros, usando la
 * API de Directions de Mapbox.
 */
export async function getDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<number> {
  const token = requireAccessToken();
  const coords = `${originLng},${originLat};${destLng},${destLat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&overview=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("No se pudo calcular la ruta de envio.");
  }
  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route || typeof route.distance !== "number") {
    throw new Error("Mapbox no regreso una ruta valida entre esos dos puntos.");
  }

  return route.distance / 1000;
}
