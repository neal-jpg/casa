# Casa web interface

The responsive Casa interface for GitHub Pages. This public repository contains HTML, CSS, JavaScript, icons and a deployment workflow only.

Financial records live in a private Google Sheet and Google Drive. A separate private backend verifies Google sign-in and the household allowlist before returning any records or accepting changes. The public site alone does not grant access to the Sheet.

## Deployment

Enable GitHub Pages with **GitHub Actions** as the source. The Pages workflow validates the publish allowlist and deploys only `frontend/`.

`frontend/public-config.js` holds only the configured public backend origin and Google OAuth web client ID. Empty settings show a setup screen and make no financial API requests. Never put Sheet IDs, account emails, keys, credentials, financial exports or screenshots here.

## Development

Serve `frontend/` with a local static server. Assets use relative paths so the site can be hosted below a repository path. The private backend must explicitly allow the deployed Pages origin.

Run `python scripts/check_publish.py` before committing or publishing. This guard rejects tracked files outside the explicit public allowlist, backend files, symlinks, private credential material, private Drive references and embedded financial payloads. Keep all original statements, workbooks, receipts and backend source outside this repository.

Financial API responses are requested without browser HTTP caching. Google identity tokens stay in memory and are exchanged for a revocable Casa session. Users choose Today, 30 days, or this tab. Restoring a remembered session verifies household access before opening records.

Signed-in devices can keep an owner-scoped, AES-GCM encrypted snapshot and pending edits in IndexedDB. Changes appear immediately and sync to Google Sheets in the background. Unconfirmed edits remain visibly pending; conflicts pause for review. Explicit sign-out waits for pending edits and clears the owner's device cache. Expired sessions retain encrypted pending edits for recovery after signing in again.

Overview shows household trends, averages, investments, life goals and the cumulative shared balance. Month holds income, spending, repayments, comparisons and category budgets. Goals set in Month repeat forward until changed; earlier months retain their saved goals.

Upload documents sends files to the private Inbox through the authenticated backend without a separate uploader login. Refresh reads the master Sheet and uses Google Gemini to analyze new Inbox files. Gemini also powers private cached summaries and Ask Casa. Numerical charts and settlement calculations do not need AI.

Financial data, drafts, AI usage and upload credentials stay in private Google resources, with the encrypted signed-in device cache described above. This public repository contains the interface only.
