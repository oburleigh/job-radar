import { buttonAttributes, PageHeader } from "@job-radar/design-ui";
import { Copy, Plus } from "lucide-react";
import { type ActionFunctionArgs, Link, redirect, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { DeleteProfileButton } from "@/contexts/discovery/presentation/web/components/delete-profile-button";
import { ProfileForm } from "@/contexts/discovery/presentation/web/components/profile-form";
import { parseProfileRequest } from "@/contexts/discovery/presentation/web/requests/profile-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader({ request }: { readonly request: Request }) {
  const profiles = discoveryWeb.getProfiles();
  const { profileDefaults } = discoveryWeb.getRuntimeSettings();
  const searchParams = new URL(request.url).searchParams;
  const requestedId = parseIdParam(searchParams.get("profile"));
  const cloneId = parseIdParam(searchParams.get("clone"));
  const createMode = searchParams.get("new") === "1";
  const cloneSource = profiles.find((profile) => profile.id === cloneId);
  const cloneDraft = cloneSource
    ? {
        name: copyProfileName(
          cloneSource.name,
          profiles.map((profile) => profile.name),
        ),
        titleTerms: cloneSource.titleTerms,
        locationTerms: cloneSource.locationTerms,
        requiredJobTerms: cloneSource.requiredJobTerms,
        excludedTitleTerms: cloneSource.excludedTitleTerms,
        excludedLocationTerms: cloneSource.excludedLocationTerms,
        excludedDescriptionTerms: cloneSource.excludedDescriptionTerms,
        includeRemote: cloneSource.includeRemote,
        includeUnverified: cloneSource.includeUnverified,
        salaryCurrency: cloneSource.salaryCurrency,
        salaryMin: cloneSource.salaryMin,
        salaryMax: cloneSource.salaryMax,
        maxAgeDays: cloneSource.maxAgeDays,
        minScore: cloneSource.minScore,
      }
    : undefined;
  const selectedProfile =
    createMode || cloneDraft
      ? undefined
      : (profiles.find((profile) => profile.id === requestedId) ?? profiles[0]);
  const selected = createMode ? undefined : (cloneDraft ?? selectedProfile);
  const selectedId = selectedProfile?.id;
  const activeProfileId = cloneSource?.id ?? selectedId;

  return {
    activeProfileId,
    cloneSourceId: cloneSource?.id,
    profileDefaults,
    profiles,
    selected,
    selectedId,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "save-profile") {
    const parsed = parseProfileRequest(formData);
    if (!parsed.ok) {
      return parsed;
    }
    const result = discoveryWeb.saveSearchProfile(parsed.command);
    if (result.status === "duplicate-name") {
      return { ok: false, message: "A profile with that name already exists." };
    }
    if (result.created) {
      throw redirect(`/profiles?profile=${result.id}`);
    }
    return { ok: true, message: "Profile saved." };
  }
  if (intent === "delete-profile") {
    const result = discoveryWeb.deleteSearchProfile({
      profileId: Number(formData.get("profileId")),
    });
    if (result.status === "not-found") {
      return { ok: false, message: "Profile not found." };
    }
    throw redirect(
      result.nextProfileId ? `/profiles?profile=${result.nextProfileId}` : "/profiles?new=1",
    );
  }
  return { ok: false, message: "Unknown profile action." };
}

export default function ProfilesPage() {
  const { activeProfileId, cloneSourceId, profileDefaults, profiles, selected, selectedId } =
    useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHeader
        index="02"
        title="Profiles"
        description="Control which titles qualify, where they must be based, and what gets rejected."
        actions={
          <div className="header-action-group">
            {selectedId ? (
              <>
                <Link {...buttonAttributes()} to={`/profiles?clone=${selectedId}`}>
                  <Copy size={17} />
                  Clone profile
                </Link>
                <DeleteProfileButton
                  profileId={selectedId}
                  profileName={selected?.name ?? "profile"}
                />
              </>
            ) : null}
            <Link {...buttonAttributes("primary")} to="/profiles?new=1">
              <Plus size={17} />
              New profile
            </Link>
          </div>
        }
      />

      <div className="profile-layout">
        <aside className="profile-list">
          <p className="index-label">Saved profiles</p>
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              to={`/profiles?profile=${profile.id}`}
              className={activeProfileId === profile.id ? "profile-link active" : "profile-link"}
            >
              <span>{profile.name}</span>
              <small>{profile.titleTerms.length} target titles</small>
            </Link>
          ))}
        </aside>
        <div className="profile-editor">
          <div className="editor-heading">
            <h2>{selected?.name ?? "New search profile"}</h2>
          </div>
          <ProfileForm
            defaults={profileDefaults}
            key={
              cloneSourceId
                ? `clone-${cloneSourceId}`
                : selectedId
                  ? `profile-${selectedId}`
                  : "new"
            }
            {...(selected ? { profile: selected } : {})}
          />
        </div>
      </div>
    </div>
  );
}

function parseIdParam(value: string | null): number {
  return Number.parseInt(value ?? "", 10);
}

function copyProfileName(name: string, existingNames: string[]): string {
  const existing = new Set(existingNames.map((value) => value.toLowerCase()));
  let candidate = `${name} copy`;
  let copyNumber = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${name} copy ${copyNumber}`;
    copyNumber += 1;
  }
  return candidate;
}
