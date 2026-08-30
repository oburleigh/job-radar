import { redirect } from "react-router";
export function loader({ request }: { readonly request: Request }) {
  return redirect(`/recruiter-search${new URL(request.url).search}`);
}
