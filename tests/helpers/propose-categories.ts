// Create or Update pull request as the dialog runs it: read the preview, then
// confirm the write it showed. A refused preview confirms Create pull request.
type App = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

export const proposeCategories = async (app: App): Promise<Response> => {
  const preview = await app.request("/api/categories/proposal/preview");
  const shown = (await preview.json()) as { kind?: string };
  return app.request("/api/categories/proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      previewed: preview.ok ? shown.kind : "changes",
    }),
  });
};
