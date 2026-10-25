import { useState, type FormEvent } from "react";

import { useCreateWorkspace } from "@/api/hooks";
import type { WorkspaceDetail, WorkspaceEnvironment } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField, TextAreaField, TextField } from "@/components/ui/FormField";
import { fieldErrors } from "@/lib/api-client";

interface Props {
  organizationId: string;
  organizationName: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (workspace: WorkspaceDetail) => void;
}

const FORM_ID = "create-workspace-form";
const INITIAL = { name: "", slug: "", description: "", environment: "development" as WorkspaceEnvironment };

export function CreateWorkspaceDialog({
  organizationId,
  organizationName,
  open,
  onClose,
  onCreated,
}: Props) {
  const mutation = useCreateWorkspace(organizationId);
  const [form, setForm] = useState(INITIAL);
  const update = (patch: Partial<typeof INITIAL>) => setForm((current) => ({ ...current, ...patch }));

  const close = () => {
    setForm(INITIAL);
    mutation.reset();
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(
      {
        name: form.name.trim(),
        environment: form.environment,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      },
      {
        onSuccess: (workspace) => {
          onCreated?.(workspace);
          close();
        },
      },
    );
  };

  const errors = fieldErrors(mutation.error);
  const error = mutation.error;
  if (error?.code === "conflict") errors.slug = error.message;
  const generalError = error && !Object.keys(errors).length ? error.message : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New workspace"
      description={`Create an isolated workspace in ${organizationName}.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
            Create workspace
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Workspace name"
          name="name"
          required
          autoFocus
          maxLength={200}
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Patient Intake Assistant"
          error={errors.name}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Slug"
            name="slug"
            maxLength={63}
            value={form.slug}
            onChange={(event) => update({ slug: event.target.value.toLowerCase() })}
            placeholder="patient-intake"
            hint="Optional, unique within the organization."
            error={errors.slug}
          />
          <SelectField
            label="Environment"
            name="environment"
            value={form.environment}
            onChange={(event) =>
              update({ environment: event.target.value as WorkspaceEnvironment })
            }
            error={errors.environment}
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </SelectField>
        </div>
        <TextAreaField
          label="Description"
          name="description"
          maxLength={2000}
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="What will this workspace deliver for the customer?"
          error={errors.description}
        />
        {generalError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {generalError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
