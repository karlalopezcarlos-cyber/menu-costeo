import Link from "next/link";
import { createOrganization } from "../actions";

export default function NewOrganizationPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Dar de alta cliente</h1>

      <form
        action={createOrganization}
        className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div className="space-y-1">
          <label htmlFor="orgName" className="text-sm font-medium text-neutral-700">
            Nombre del restaurante
          </label>
          <input
            id="orgName"
            name="orgName"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <hr className="border-neutral-200" />
        <p className="text-sm font-medium text-neutral-700">Usuario dueno (OWNER) inicial</p>

        <div className="space-y-1">
          <label htmlFor="ownerName" className="text-sm font-medium text-neutral-700">
            Nombre (opcional)
          </label>
          <input
            id="ownerName"
            name="ownerName"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="ownerEmail" className="text-sm font-medium text-neutral-700">
            Correo
          </label>
          <input
            id="ownerEmail"
            name="ownerEmail"
            type="email"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="ownerPassword" className="text-sm font-medium text-neutral-700">
            Contrasena inicial
          </label>
          <input
            id="ownerPassword"
            name="ownerPassword"
            type="password"
            required
            minLength={8}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Crear cliente
          </button>
          <Link href="/admin/organizations" className="text-sm text-neutral-500 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
