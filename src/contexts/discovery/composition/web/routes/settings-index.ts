import { redirect } from "react-router";

export function loader({ request }: { readonly request: Request }) {
  const url = new URL(request.url);
  const ats = url.searchParams.get("ats");
  const create = url.searchParams.get("new");
  if (ats || create === "1") {
    const params = new URLSearchParams();
    if (ats) params.set("ats", ats);
    if (create === "1") params.set("new", "1");
    return redirect(`/settings/adapters/ats-registry?${params.toString()}`);
  }
  return redirect("/settings/opportunities");
}
