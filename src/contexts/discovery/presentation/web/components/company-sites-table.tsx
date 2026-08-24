import { Button } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { ToggleButton } from "./toggle-button";

export interface CompanySiteBoard {
  readonly id: number;
  readonly atsType: string;
  readonly companyName: string;
  readonly slug: string;
  readonly baseUrl: string;
  readonly enabled: boolean;
  readonly lastSyncedAt: Date | null;
  readonly lastError: string;
  readonly lastWarning: string;
}

export type CompanySitesSortKey = "company" | "ats" | "last-refresh" | "health" | "enabled";
export type CompanySitesSortDirection = "ascending" | "descending";

export interface CompanySitesSort {
  readonly key: CompanySitesSortKey;
  readonly direction: CompanySitesSortDirection;
}

interface CompanySitesTableProps {
  boards: readonly CompanySiteBoard[];
  atsLabels: Readonly<Record<string, string>>;
}

const defaultSort: CompanySitesSort = { key: "company", direction: "ascending" };
const textCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function CompanySitesTable({ boards, atsLabels }: CompanySitesTableProps) {
  const [sort, setSort] = useState<CompanySitesSort>(defaultSort);
  const sortedBoards = useMemo(
    () => sortCompanySites(boards, atsLabels, sort),
    [atsLabels, boards, sort],
  );

  if (boards.length === 0) {
    return (
      <div className="table-empty">
        Add a known ATS URL or run discovery to populate this registry.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Company or slug"
              sortKey="company"
              sort={sort}
              onSort={setSort}
            />
            <SortableHeader label="ATS" sortKey="ats" sort={sort} onSort={setSort} />
            <SortableHeader
              label="Last refresh"
              sortKey="last-refresh"
              sort={sort}
              onSort={setSort}
            />
            <SortableHeader label="Health" sortKey="health" sort={sort} onSort={setSort} />
            <SortableHeader label="Enabled" sortKey="enabled" sort={sort} onSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {sortedBoards.map((board) => {
            const companyDisplayName = getCompanyDisplayName(board);
            const health = getCompanySiteHealth(board);

            return (
              <tr key={board.id}>
                <td>
                  <a href={board.baseUrl} target="_blank" rel="noreferrer">
                    {companyDisplayName}
                  </a>
                  <small>{board.baseUrl}</small>
                </td>
                <td>{getAtsLabel(board, atsLabels)}</td>
                <td>{formatDate(board.lastSyncedAt)}</td>
                <td>
                  <span className={health.className}>
                    {health.label === "Ready" ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <CircleAlert size={14} />
                    )}
                    {health.label}
                  </span>
                  {health.detail ? <small className="health-detail">{health.detail}</small> : null}
                </td>
                <td>
                  <ToggleButton
                    id={board.id}
                    enabled={board.enabled}
                    kind="board"
                    label={companyDisplayName}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function getNextCompanySitesSort(
  current: CompanySitesSort,
  requestedKey: CompanySitesSortKey,
): CompanySitesSort {
  if (current.key !== requestedKey) {
    return { key: requestedKey, direction: "ascending" };
  }

  return {
    key: requestedKey,
    direction: current.direction === "ascending" ? "descending" : "ascending",
  };
}

export function sortCompanySites(
  boards: readonly CompanySiteBoard[],
  atsLabels: Readonly<Record<string, string>>,
  sort: CompanySitesSort = defaultSort,
): CompanySiteBoard[] {
  return [...boards].sort((left, right) => {
    const primaryComparison = comparePrimary(left, right, atsLabels, sort);
    if (primaryComparison !== 0) {
      return primaryComparison;
    }

    const companyComparison = textCollator.compare(
      getCompanyDisplayName(left),
      getCompanyDisplayName(right),
    );
    return companyComparison || left.id - right.id;
  });
}

interface SortableHeaderProps {
  label: string;
  sortKey: CompanySitesSortKey;
  sort: CompanySitesSort;
  onSort: (sort: CompanySitesSort) => void;
}

function SortableHeader({ label, sortKey, sort, onSort }: SortableHeaderProps) {
  const active = sort.key === sortKey;
  const direction = active ? sort.direction : undefined;

  return (
    <th aria-sort={direction}>
      <Button
        className="sortable-header-button"
        aria-label={`Sort by ${label}${direction ? `, currently ${direction}` : ""}`}
        onClick={() => onSort(getNextCompanySitesSort(sort, sortKey))}
      >
        <span>{label}</span>
        <span className="sort-direction" aria-hidden="true">
          {direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}
        </span>
      </Button>
    </th>
  );
}

function comparePrimary(
  left: CompanySiteBoard,
  right: CompanySiteBoard,
  atsLabels: Readonly<Record<string, string>>,
  sort: CompanySitesSort,
): number {
  if (sort.key === "last-refresh") {
    return compareLastRefresh(left.lastSyncedAt, right.lastSyncedAt, sort.direction);
  }

  let comparison: number;
  switch (sort.key) {
    case "company":
      comparison = textCollator.compare(getCompanyDisplayName(left), getCompanyDisplayName(right));
      break;
    case "ats":
      comparison = textCollator.compare(
        getAtsLabel(left, atsLabels),
        getAtsLabel(right, atsLabels),
      );
      break;
    case "health":
      comparison = textCollator.compare(getHealthLabel(left), getHealthLabel(right));
      break;
    case "enabled":
      comparison = Number(left.enabled) - Number(right.enabled);
      break;
  }

  return sort.direction === "ascending" ? comparison : -comparison;
}

function compareLastRefresh(
  left: Date | null,
  right: Date | null,
  direction: CompanySitesSortDirection,
): number {
  if (left === null) {
    return right === null ? 0 : 1;
  }
  if (right === null) {
    return -1;
  }

  const comparison = left.getTime() - right.getTime();
  return direction === "ascending" ? comparison : -comparison;
}

function getCompanyDisplayName(board: CompanySiteBoard): string {
  return board.companyName || board.slug;
}

function getAtsLabel(board: CompanySiteBoard, atsLabels: Readonly<Record<string, string>>): string {
  return atsLabels[board.atsType] ?? board.atsType;
}

export function getCompanySiteHealth(board: CompanySiteBoard): {
  readonly label: "Needs attention" | "Partial" | "Ready";
  readonly className: string;
  readonly detail: string;
} {
  if (board.lastError) {
    return { label: "Needs attention", className: "health health-error", detail: board.lastError };
  }
  if (board.lastWarning) {
    return { label: "Partial", className: "health health-warning", detail: board.lastWarning };
  }
  return { label: "Ready", className: "health health-ok", detail: "" };
}

function getHealthLabel(board: CompanySiteBoard): "Needs attention" | "Partial" | "Ready" {
  return getCompanySiteHealth(board).label;
}

function formatDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "Not refreshed";
}
