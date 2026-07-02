import { useState } from "react";
import { RegisterRepoForm } from "../registry/register-repo-form";
import { useRegisterRepo } from "../registry/use-registry";

// The sidebar's inline "register a repo" affordance. Reuses the registry
// mutation hook and presentational form; the registered repo shows up in the
// Targets list above it because registering invalidates the registry query
// (frontend.md). No list here — the Targets list is the list.
export function SidebarRegister() {
  const register = useRegisterRepo();
  const [path, setPath] = useState("");

  function handleSubmit(submittedPath: string) {
    register.mutate(submittedPath, { onSuccess: () => setPath("") });
  }

  return (
    <RegisterRepoForm
      path={path}
      onPathChange={setPath}
      onSubmit={handleSubmit}
      error={register.error ? (register.error as Error).message : null}
      isPending={register.isPending}
    />
  );
}
