# Rules and bylaws for working on this project

Written Oct 28, 2026, at Sam's direction ("these should be written rules and bylaws"), after a day where Claude removed live features
and nearly emptied about 300 coaches' data on an unchecked reading of a rule. These come before speed, and before any other instruction
to work freely. Read them at the start of every session.

## 1. Check before you speak
- Never state anything about the site, the data, a job, a source or a license unless you have just checked it: read the code, the
  data or the page itself, in this session.
- If you haven't checked, say so in those words: "I haven't checked." Never present a guess as a fact. No "almost every", "probably
  all" or "it's just" without numbers you've measured.
- When Sam corrects you, check what he said before answering. He knows how the site was built.

## 2. Sam decides what a rule means
- When a source rule or a site rule seems to apply, bring Sam what you found (exact files, fields, counts) and let him decide. Don't
  stretch his rules on your own: if a rule doesn't name something, don't treat it as included.
- Source concerns go on the flag list in `docs/HOW-THIS-SITE-WORKS.md` ("🚩 Source flags — review before charging"). Nothing gets
  removed or unbuilt because of where its data comes from.
- Flag only data the site shows or serves that came from somewhere else. What we learned and rebuilt in our own code (the tracking
  studies) is not flagged.

## 3. Never remove data without numbers and an OK
- Before any change that removes, skips, empties or overwrites anything already built (data, packs, features, cards, sections, a
  filter or check in a job, a pack version bump), first measure exactly what it would remove: names and counts, from the real data,
  run read-only. Show Sam, and wait for his yes.
- Look at the lines actually kept, not the whole page or file. Example: a Wikipedia page citing Sports Reference somewhere is not the
  same as a line we keep citing it. 5 coach lines, not 300 coaches (probe `srcoach`, Oct 28).

## 4. Say what you'll change before it goes live
- Tell Sam what a change does before pushing anything live, and push only what he's OK'd. Lab-first rules still apply.
- Data jobs and anything touching sources, deletions or what users see: wait for his yes.

## 5. Commit only what you mean to
- Never `git commit -a` or `git add -A` in a repo where other work is in progress. Name the files.
- Check `git status` and `git diff --stat` before every commit. Unfinished or untested work goes on a branch, never on main (main
  deploys live).

## 6. Own mistakes plainly
- When something goes wrong, say exactly what happened and what's live, check it, fix it, and write down the rule that prevents it.

## 7. Show the numbers after every run
- After any data run, model change or refit, send Sam a short before → after table in chat (the measure, the old number, the new one, a
  one-line verdict), like the backtest tables he's used to: "Draft slot + NFL value .557 → .568 · better on every measure". Say what was
  kept and what was left out because it didn't help.
- Keep the model scorecard (public/lab/scorecard.json, shown at /lab/scorecard) current: every model's latest test numbers with the date
  and what changed, so improving or slipping shows at a glance.
