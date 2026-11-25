# Rubric: when a suggested CV line is refused

Every CV line a model suggests, and every line the person edits, runs through these checks before the person can accept it. A refused line never reaches the CV. If every line for an entry is refused, YoCV shows the template line instead and labels it `template wording`.

The checks are code, not a second model call: `core.js` (`checkCvText`, the same in the browser and on the server), `server/cv/validate.js` (`checkBullet`) and `server/validate.js` (the quote and duplicate checks). The word lists live in `cv-rules.js`. The person sees the wording in the last column, from `cv-copy.js`.

The test cases in `handover/test-cases/cv-lines.json` hold one example per rule. `npm test` runs them.

| Code | The line is refused when | What the person reads |
| --- | --- | --- |
| `invented_number` | It holds a number, a vague amount ("dozens") or a month that the person did not give. | It added a number you did not give. |
| `hedge_dropped` | The person said "about" or "at least" before their number and the line leaves it out. | It left out the word you put before your number. |
| `invented_name` | It names a person, a place, an organisation or a weekday the person did not give, or it keeps a `[name]` placeholder. | It added a name or a place you did not give. |
| `contact_detail` | It holds a phone number or an email. | It holds a phone number or an email. Contact details go in the contact line. |
| `overstated` | It uses an inflation word (certified, qualified, licensed, verified, expert, proficient, professional, advanced, or a form of one), a banned claim, or a role upgrade (managed, led, ran, owned, supervised, trained) the person did not use a form of themselves. | It makes the work sound bigger than you said. |
| `weak_opening` | It opens with "Responsible for", "Helped with" or "Duties included", or with a word that is not on the verb list and not the person's own -ed or -ing word. | It does not start with something you did. |
| `length` | It is shorter than 40 or longer than 180 characters. | It is too short or too long for one CV line. |
| `not_one_sentence` | It is more than one sentence. | It is more than one sentence. |
| `exclamation` | It has an exclamation mark. | It has an exclamation mark. |
| `quote_not_found` | Its `sourceQuote` is not in the person's answers. For a skill: the quote that shows the skill is not in the answers. | It quotes words that are not in your answers. |
| `duplicate` | It repeats another line of the same entry. | It repeats another line. |
| `over_limit` | It is the third or later line for one entry (two per entry at most). | It goes past the number of lines one entry can have. |
| `skill_not_in_menu` | The model names a skill that is not on the role's skill list (`data/role-skills.json`). | It names a skill that is not on the list for this role. |

## What the checks do not catch

- A line in the first person ("for women in my street") passes. The prompt asks for no first person; no check enforces it.
- A lowercase name of another person ("mama joy") is not seen as a name, so it is neither masked nor refused.
- A line can pass every check and still read badly. The person's read-back and Accept is the last check.
- Lines in a language other than English pass through the English word lists unchanged.

## Skill evidence levels

Each skill on the CV shows the label of its strongest source (`server/cv/skills.js`). A skill is never shown as confirmed on the strength of the person's own words, and more sources never move a skill up a level.

| Level | Source | Label on the CV |
| --- | --- | --- |
| S1 | A ticked Yoma completion or wallet credential that names the skill | Confirmed from Yoma |
| S2 | A live, shown YoVouch line on the person's newest card | Vouched by a customer, confirmed by them, not by Yoma (or: by another worker) |
| S3 | A quote from the person's interview answer that shows the skill | From your own account |
| S4 | The person added it by hand, or a self-attested Yoma credential names it | Self-stated |

## The employer check behind the QR

The rules for what the signed CV check may show are in `docs/superpowers/specs/2026-11-25-yocv-qr-verify-design.md`, section "Trust rules". In short: the server decides every label, re-runs every line through the checks above, takes the months from its own session, leaves out the place and every contact detail, and signs the result for 90 days.
