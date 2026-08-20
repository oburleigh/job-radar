import { Copy, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { getProfiles } from "@/contexts/discovery/adapters/driven/sqlite/radar-read-model";
import { DeleteProfileButton } from "@/contexts/discovery/adapters/driving/web/delete-profile-button";
import { saveProfileAction } from "@/contexts/discovery/adapters/driving/web/profile-actions";
import { ProfileForm } from "@/contexts/discovery/adapters/driving/web/profile-form";

export const dynamic = "force-dynamic";

interface ProfilesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  const profiles = getProfiles();
  const params = await searchParams;
  const requestedId = parseIdParam(params.profile);
  const cloneId = parseIdParam(params.clone);
  const createMode = firstParam(params.new) === "1";
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
                <Link className="button button-secondary" href={`/profiles?clone=${selectedId}`}>
                  <Copy size={17} />
                  Clone profile
                </Link>
                <DeleteProfileButton
                  profileId={selectedId}
                  profileName={selected?.name ?? "profile"}
                />
              </>
            ) : null}
            <Link className="button button-primary" href="/profiles?new=1">
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
              href={`/profiles?profile=${profile.id}`}
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
            saveProfile={saveProfileAction}
            key={
              cloneSource ? `clone-${cloneSource.id}` : selectedId ? `profile-${selectedId}` : "new"
            }
            {...(selected ? { profile: selected } : {})}
          />
        </div>
      </div>
    </div>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIdParam(value: string | string[] | undefined): number {
  return Number.parseInt(firstParam(value) ?? "", 10);
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
