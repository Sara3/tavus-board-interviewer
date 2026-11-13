# Board Interviewer

An AI first-round system design screen on **Tavus CVI**. The candidate talks to a Tavus PAL ("Anna") and draws on a live Excalidraw board in the same page. Anna reads the board as **structured text** (boxes, labeled arrows, notes) pushed with `conversation.overwrite_llm_context`, not through screen-share vision. The hiring team reviews a rubric with evidence, the final board and the transcript on `/review`.

## Run it (about 5 minutes, uses your own Tavus key)

Needs Node 20+.

```bash
cp .env.example .env      # add TAVUS_API_KEY
npm install
npm run setup             # creates the tools, guardrails and PAL in your account; writes TAVUS_PAL_ID to .env
npm run seed-demo         # optional: 3 sample sessions for /review
npm run dev               # http://localhost:5173
```

## Where to look

| URL | What |
|---|---|
| `localhost:5173` | Candidate view: enter a name and start an 8-minute interview |
| `localhost:5173/review` | Hiring team view: score, rubric with evidence, requirements raised vs missed, final board (PNG), transcript, latency per turn |
| `localhost:5173/architecture` | One-page architecture and the Tavus gaps it works around |

## Tavus gaps it works around

| Gap | Workaround |
|---|---|
| Vision misreads the board and invents arrows | Board serialized to text and pushed via `overwrite_llm_context`; `read_board` tool before Anna comments |
| Lists read aloud | `show_list` tool renders them on screen |
| Re-asking while the candidate draws | `idle_engagement: off` plus a "silence is work" rule |
| Time warning varies per run | Fixed 2-minute line sent with `conversation.echo` |
| `rubric_mark` tool calls fire unreliably | Evidence pass over transcript and final board fills unmarked items; interviewer marks always win |

## Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `TAVUS_MAX_CALL_SECONDS` | 480 | Call length (real screen: 1800 to 2700) |
| `INTERVIEW_SCOPE` | `screen` | `screen` = requirements + high-level design, `full` = every area |
| `DEFAULT_QUESTION` | `cancel-winback` | Also `rideshare`, `url-shortener`, `random` |
| `TAVUS_FACE_ID` | stock face | Any replica in your account |

`npm test` runs the unit tests. More detail (architecture diagram, session flow, file map): [docs/DETAILS.md](docs/DETAILS.md).
