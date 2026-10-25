import { useState, type FormEvent } from "react";

import { useCreateOrganization } from "@/api/hooks";
import type { Organization } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/FormField";
import { ApiError, fieldErrors } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (organization: Organization) => void;
}

const FORM_ID = "create-organization-form";

export function CreateOrganizationDialog({ open, onClose, onCreated }: Props) {
  const mutation = useCreateOrganization();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const close = () => {
    setName("");
    setSlug("");
    mutation.reset();
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(
      { name: name.trim(), ...(slug.trim() ? { slug: slug.trim() } : {}) },
      {
        onSuccess: (organization) => {
          onCreated?.(organization);
          close();
        },
      },
    );
  };

  const errors = fieldErrors(mutation.error);
  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  if (apiError?.code === "conflict") errors.slug = apiError.message;
  const generalError = apiError && !Object.keys(errors).length ? apiError.message : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New customer organization"
      description="Each organization is an isolated tenant. You will become its owner."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
            Create organization
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Organization name"
          name="name"
          required
          autoFocus
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Northwind Health"
          error={errors.name}
        />
        <TextField
          label="Slug"
          name="slug"
          maxLength={63}
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          placeholder="northwind-health"
          hint="Optional. Lowercase letters, numbers and hyphens. Generated from the name if blank."
          error={errors.slug}
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
