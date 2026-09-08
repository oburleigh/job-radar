## What this changes

## Why

## Evidence

Paste the gate's exit status and its test-file and test counts:

```
pnpm verify > reports/gate.log 2>&1; echo "EXIT: $?"
```

- [ ] `EXIT: 0`
- [ ] Test file count did not go down
- [ ] User-facing change: screenshots at a desktop and a mobile width, light and
      dark where colour changed

## Notes for the reviewer

Anything you decided rather than derived: an assumption, a dropped requirement
and why, or a place you would welcome a second opinion.
