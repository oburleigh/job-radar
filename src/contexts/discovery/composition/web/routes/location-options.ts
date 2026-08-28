import { assertLocalHost } from "@/platform/http/require-local-request";
import { searchLocations } from "@/platform/locations/location-search.server";

export function loader({ request }: { readonly request: Request }) {
  assertLocalHost(request.headers.get("host") ?? "");
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 120) {
    return Response.json({ message: "Location search is too long." }, { status: 400 });
  }
  try {
    return Response.json(
      { options: searchLocations(query) },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return Response.json(
      { error: "Location suggestions are unavailable. Try again.", options: [] },
      { status: 503 },
    );
  }
}
