"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createOrganization, type CreateOrganizationState } from "../actions";

const initialState: CreateOrganizationState = {};

function CopyCredentialsButton({ orgName, email, password }: { orgName: string; email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = `Restaurante: ${orgName}\nUsuario: ${email}\nContrasena: ${password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
    >
      {copied ? "Copiado ✓" : "Copiar usuario y contrasena"}
    </button>
  );
}

export default function NewOrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    const { orgName, email, password } = state.success;
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-5">
        <p className="text-sm font-medium text-green-800">Cliente creado correctamente.</p>
        <dl className="space-y-1 text-sm text-neutral-700">
          <div>
            <dt className="inline font-medium">Restaurante: </dt>
            <dd className="inline">{orgName}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Usuario: </dt>
            <dd className="inline">{email}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Contrasena: </dt>
            <dd className="inline font-mono">{password}</dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-500">
          Guarda esta contrasena ahora: por seguridad no se puede volver a mostrar despues.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <CopyCredentialsButton orgName={orgName} email={email} password={password} />
          <Link href="/admin/organizations" className="text-sm text-neutral-500 hover:underline">
            Ir a la lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
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
        <div className="flex gap-2">
          <input
            id="ownerPassword"
            name="ownerPassword"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear cliente"}
        </button>
        <Link href="/admin/organizations" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
