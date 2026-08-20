# Discovery

Discovery finds job listings and evaluates them against a person's search criteria. It owns source coverage, search execution, listing verification, and matching.

## Language

**Search profile**:
A named set of titles, locations, exclusions, age limits, score thresholds, and optional salary preferences used to decide which job listings qualify.
_Avoid_: Job alert, search settings

**Salary preference**:
An optional annual compensation range and currency attached to a search profile. It describes what the person wants, not what an employer has published.
_Avoid_: Salary filter, expected salary

**Source**:
A job site or domain included in web search coverage.
_Avoid_: Provider, board

**ATS integration**:
The rules Job Radar uses to recognise and read listings from one applicant tracking system.
_Avoid_: Source, connector

**Company board**:
A company's job catalogue hosted by an ATS and available for direct synchronisation.
_Avoid_: Source, careers page

**Discovery run**:
One execution of a search profile across its enabled sources and company boards.
_Avoid_: Scan, search job

**Search result**:
A page returned by a search provider before Job Radar has confirmed that it is a current job listing.
_Avoid_: Match, job listing

**Job listing**:
A normalised job vacancy collected from an ATS or another supported job site.
_Avoid_: Search result, opportunity

**Unverified lead**:
A search result that looks like a job listing but could not be confirmed through a structured source.
_Avoid_: Match, job listing

**Match**:
The result of evaluating a job listing against one search profile. A match records the score and the reasons for inclusion or exclusion.
_Avoid_: Search result, saved job
