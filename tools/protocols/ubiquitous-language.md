# The ubiquitous-language protocol

Run this when a business term is **missing** from the owning context's
`CONTEXT.md` Language section, **disputed** because two people or two layers
call the same thing different names, or **duplicated** because one concept has
acquired a second name in code, copy, telemetry or tests.

Do not run it for a variable name, a local helper, a file name, or anything a
user will never see and no other layer will read. This is for the vocabulary the
domain, the database, the UI and the tracker all have to agree on.

It lives under `tools/` rather than in `AGENTS.md` for one reason: `/AGENTS.md`
is gitignored, so a rule kept only there exists on one machine and a fresh clone
gets nothing. This file is tracked.

## The short version

Name the concept, not its representation. Write the definition before the code.
Record what the term is **not**. Then use it everywhere, at once.

## The protocol

### 1. Find out whether the term already exists

Read the owning context's `CONTEXT.md` Language section in full. Then search the
context for the concept rather than the word, because a duplicate hides under a
different name:

```bash
rg -n "<candidate>|<synonym>|<abbreviation>" src/contexts/<context> --stats
```

Three outcomes, and they are different jobs:

- **The term exists and fits.** Use it. Stop here. Most of the time this is the
  answer, and reaching for a new word is the mistake.
- **The term exists under another name.** This is a rename, not a new term. Go
  to step 4 and then to the rename rules below.
- **The concept has no term.** Continue.

### 2. Decide whether it is one concept

A term that needs "or" in its definition is two terms. A term whose definition
changes depending on which layer is asking is two terms. Split it and run the
rest of the protocol on each.

Check it against the concepts either side of it. If the new term cannot be
stated without redefining a neighbour, the neighbour's entry is what actually
needs changing.

### 3. Choose the word

In order of preference:

1. **What the user already calls it.** Recruiter Search settings say "Reasoning
   effort" because that is the label the operator reads.
2. **What the trade already calls it.** A recruitment firm is a recruitment
   firm.
3. **What the protocol or standard calls it**, where one applies.

Reject, in this order:

- a **broad synonym** standing in for a specific concept. "Data", "item",
  "record", "info", "config", "handler", "manager", "service"
- a word already carrying a different meaning in this context. Check the
  Language section before committing
- an **abbreviation** the domain does not itself use. `DNC` was rejected in
  favour of Do Not Contact
- a word whose meaning depends on the implementation. If renaming the adapter
  would make the term wrong, the term is naming the mechanism, not the concept

### 4. Write the entry before writing the code

Add it to the owning context's `CONTEXT.md`, in the format that section already
uses, positioned next to the concepts it relates to rather than appended:

```markdown
**Term**
: One sentence saying what it is. A second sentence only if an invariant, a
  lifetime or a boundary is not obvious from the first.
_Avoid_: the rejected aliases, comma separated
```

The `_Avoid_` line is the part that does work later. It is what a reviewer
greps for, and what tells the next agent that a plausible-sounding synonym was
considered and refused. An entry with nothing to avoid is usually an entry
nobody argued about, which is fine; leave the line off rather than inventing a
rejection.

### 5. Use it everywhere in the same change

The term lands in one commit across: domain types, application commands and
results, ports, adapters, request and persistence schemas, UI copy, telemetry,
test names, fixtures, and this context's docs. A term that is canonical in the
domain and absent from the UI has not been adopted; it has been proposed.

### 6. Prove the old name is gone

A vocabulary change needs a behaviour test that asserts the canonical term and
rejects the replaced label. Then read the whole context diff for survivors:

```bash
rg -n "<rejected alias>" src/contexts/<context> e2e docs
```

Zero hits outside the `_Avoid_` line itself, or the rename is half done.

## Renaming a term that is already in use

Everything above, plus:

- **Persisted data keeps the old shape until a migration changes it.** A rename
  in code does not rename a column or a JSON key. Either migrate, or map at the
  persistence boundary and say so in a comment there, which is one of the few
  places a comment earns its place.
- **A run, record or evidence trail written under the old name still parses.**
  The reader accepts both; the writer only writes the new one.
- **The tracker keeps the old ticket titles.** Do not rewrite history to match.

## What this protocol does not decide

It does not decide product policy, and it is not a design review. If the
argument is really about what the feature should do, the term is the symptom.
Settle the behaviour first, then name it.

## When the protocol produces no answer

If two names both survive step 3, the tie is a product decision and goes to the
user with both options and their consequences stated. Do not pick one to keep
moving and record it as settled. A term chosen to avoid asking is the exact
thing an `_Avoid_` line cannot warn anyone about.
