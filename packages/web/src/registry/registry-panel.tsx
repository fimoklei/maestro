import { RegisterRepoForm } from "./register-repo-form";
import { RegisteredReposList } from "./registered-repos-list";
import { useRegisterRepo, useRegistry } from "./use-registry";

// Container: wires the registry server-state hooks to the presentational form
// and list. Maps a failed registration to readable error text on the form.
export function RegistryPanel() {
  const registry = useRegistry();
  const register = useRegisterRepo();

  return (
    <section>
      <h2>Registered repos</h2>
      <RegisterRepoForm
        onSubmit={(path) => register.mutate(path)}
        error={register.error ? (register.error as Error).message : null}
        isPending={register.isPending}
      />
      {registry.isLoading ? (
        <p>Loading…</p>
      ) : registry.isError ? (
        <p role="alert">Could not load registered repos.</p>
      ) : (
        <RegisteredReposList repos={registry.data?.repos ?? []} />
      )}
    </section>
  );
}
