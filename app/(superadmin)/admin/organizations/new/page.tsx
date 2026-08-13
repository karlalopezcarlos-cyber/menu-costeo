import NewOrganizationForm from "./NewOrganizationForm";

export default function NewOrganizationPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Dar de alta cliente</h1>
      <NewOrganizationForm />
    </div>
  );
}
