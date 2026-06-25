# Meta Creative Report Dashboard

React + Vite dashboard that pulls ad-level performance from the **Meta Marketing API**
and exports it to an Excel file matching `New-Creative-Report-May-2026.xlsx`.

A small Express proxy (`server/`) holds your access token server-side — the browser
never sees it, which also avoids Meta's CORS restrictions.

## Setup

```bash
npm install
cp server/.env.example server/.env   # then edit server/.env
```

Fill in `server/.env`:

| Variable | What it is |
|---|---|
| `META_ACCESS_TOKEN` | Long-lived token with `ads_read` |
| `META_AD_ACCOUNT_ID` | Ad account id **without** `act_` |
| `META_RESULT_ACTION` | action_type that counts as a "result" (e.g. `lead`) |
| `META_RESULT_LABEL`  | Label shown in the report (e.g. `Leads (form)`) |

### Getting a token
1. Go to https://developers.facebook.com/ → create an App (type: Business).
2. Add the **Marketing API** product.
3. Generate a token with the `ads_read` permission, then exchange it for a
   long-lived token (60 days) via the Graph API.
4. Find your ad account id under **Ads Manager → Account Settings** (drop `act_`).

## Run

```bash
npm run dev:all
```

- Frontend: http://localhost:5173
- API proxy: http://localhost:4000

Pick a date range, click **Fetch report**, then **Export to Excel**.

## How the columns map

`server/meta.js` requests Graph API fields and maps them to the spreadsheet's
17 columns. The mapping (Graph field → report column) is documented there and is
easy to tweak — especially `Result type` / `Results`, which depend on which
`action_type` your campaigns optimize for.

## Production build

```bash
npm run build      # outputs dist/
npm run server     # serve the API; host dist/ behind any static server
```
