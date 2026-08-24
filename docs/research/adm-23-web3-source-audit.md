# ADM-23 Web3 source audit

Checked on 2026-08-24 with Job Radar's configured user agent,
`JobRadar/1.0 (local application)`. Only the fields consumed by the structured
page adapter were inspected. No response bodies were saved.

## Live result

| Source | Representative page | Job Radar response | Structured data found |
| --- | --- | --- | --- |
| Web3 Career | [Senior Software Engineer, Backend at Helius](https://web3.career/senior-software-engineer-backend-helius/153058) | HTTP 200 | One schema.org `JobPosting` object |
| Cryptocurrency Jobs | [Engineer at Soter Labs](https://cryptocurrencyjobs.co/engineering/soter-labs-engineer/) | HTTP 200 | One schema.org `JobPosting` object |
| CryptoJobsList | [Senior Software Engineer at CoinList](https://cryptojobslist.com/jobs/senior-software-engineer-united-states-at-coinlist) | HTTP 403 | Not inspectable because the response was a Cloudflare challenge page |

## Job Radar live acceptance

The application adapter fetched the same public pages on 2026-08-24 using a
fresh temporary SQLite database. It returned:

| Source | Adapter result | Evidence |
| --- | --- | --- |
| Web3 Career | `verified` | Senior Software Engineer, Backend at Helius; canonical page used as the apply URL |
| Cryptocurrency Jobs | `verified` | Engineer at Soter Labs; canonical page used as the apply URL |
| CryptoJobsList | `unavailable` with `protected` | HTTP challenge retained as an unverified outcome |
| Cryptocurrency Jobs closed example | `closed` with `expired` | Expired structured date took precedence over the generic closed marker |

The check used no provider key, personal database, or saved response body.

Web3 Career currently supplies `title`, `hiringOrganization`, `datePosted`,
`validThrough`, `employmentType`, `jobLocationType`,
`applicantLocationRequirements`, and `jobLocation`. Its `url` field is absent,
so a fixture which adds one would misrepresent the current source shape.
`employmentType` is a string and the dates include a time and UTC offset.
[Source page](https://web3.career/senior-software-engineer-backend-helius/153058)

Cryptocurrency Jobs supplies the same core fields but omits `jobLocation` and
`url`. Its `employmentType` is an array and its dates use date-only strings.
The remote location is represented by `jobLocationType: "TELECOMMUTE"` plus an
`applicantLocationRequirements` country named `Anywhere`.
[Source page](https://cryptocurrencyjobs.co/engineering/soter-labs-engineer/)

The current CryptoJobsList URL returns HTTP 403 to Job Radar's configured user
agent. The response contains a challenge page instead of the listing, so it
should enter the protected and unverified path. There is no sound basis for a
`JobPosting` fixture from this response.
[Source page](https://cryptojobslist.com/jobs/senior-software-engineer-united-states-at-coinlist)

## Closed listing evidence

Cryptocurrency Jobs retains a public closed page for the
[Bitcoin Open Source Developer role at Chaincode Labs](https://cryptocurrencyjobs.co/engineering/chaincode-labs-bitcoin-open-source-developer/).
The page says the opportunity is no longer available and still includes a
`JobPosting` object with `validThrough: "2026-01-05"`. Both signals are expired
on the audit date. This is a useful fixture for proving that an expired listing
cannot be saved as active.

## Minimal fixture shapes

Fixtures should preserve the vendor's field types while replacing descriptions,
company names, images, and external links with short synthetic values. Full page
captures would add unstable navigation, advertising, tracking, and challenge
markup that the adapter does not consume.

The Web3 Career fixture needs this shape:

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Platform Engineer",
  "description": "Build and maintain the product.",
  "datePosted": "2026-08-20T13:29:46+00:00",
  "validThrough": "2026-11-18T13:29:46+00:00",
  "employmentType": "Full-time",
  "jobLocationType": "TELECOMMUTE",
  "applicantLocationRequirements": {
    "@type": "Country",
    "name": "Anywhere"
  },
  "jobLocation": {
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "United States",
      "addressLocality": "Anywhere"
    }
  },
  "hiringOrganization": {
    "@type": "Organization",
    "name": "Example Labs"
  }
}
```

This matches the active
[Web3 Career page](https://web3.career/senior-software-engineer-backend-helius/153058),
including the missing `url` field and string `employmentType`.

The Cryptocurrency Jobs fixture needs this variation:

```json
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Protocol Engineer",
  "description": "Build and maintain the protocol.",
  "datePosted": "2026-08-18",
  "validThrough": "2026-09-18",
  "employmentType": ["FULL_TIME"],
  "jobLocationType": "TELECOMMUTE",
  "applicantLocationRequirements": {
    "@type": "Country",
    "name": "Anywhere"
  },
  "hiringOrganization": {
    "@type": "Organization",
    "name": "Example Protocol"
  }
}
```

This matches the active
[Cryptocurrency Jobs page](https://cryptocurrencyjobs.co/engineering/soter-labs-engineer/),
including its array `employmentType`, date-only values, and absent `jobLocation`
and `url` fields.

The CryptoJobsList fixture should be an HTTP response fixture, not invented
structured data:

```text
status: 403
content-type: text/html
body: <html><title>Just a moment</title></html>
```

That is the smallest safe representation of the protected response observed at
the current [CryptoJobsList page](https://cryptojobslist.com/jobs/senior-software-engineer-united-states-at-coinlist).
Do not copy the vendor's full challenge body because it is transient and is not
part of the listing contract.

For expiry, reuse the Cryptocurrency Jobs shape with an audit clock after
`validThrough`, and add the visible closed marker in the surrounding HTML. The
[closed Chaincode Labs page](https://cryptocurrencyjobs.co/engineering/chaincode-labs-bitcoin-open-source-developer/)
shows that both signals can be present together.

## Test implications

The first useful evidence set is four boundary cases:

1. A Web3 Career page verifies and falls back to its canonical source URL when
   structured `url` is absent.
2. A Cryptocurrency Jobs page verifies despite array `employmentType`,
   date-only values, and absent `jobLocation`.
3. A Cryptocurrency Jobs page becomes closed when `validThrough` is before the
   lookup clock, with the closed reason retained.
4. A CryptoJobsList challenge remains an unverified lead and records
   `protected`, rather than being treated as malformed schema or a missing job.

Malformed structured data should use a separate synthetic mutation of one of
the two accessible fixtures. It should not be represented by the CryptoJobsList
challenge because the origin listing markup was never returned.
