# Casa web interface

The responsive Casa interface for GitHub Pages. This public repository contains HTML, CSS, JavaScript, icons and a deployment workflow only.

Financial records live in a private Google Sheet and Google Drive. A separate private backend verifies Google sign-in and the household allowlist before returning any records or accepting changes. The public site alone does not grant access to the Sheet.

## Deployment

Enable GitHub Pages with **GitHub Actions** as the source. The Pages workflow validates the publish allowlist and deploys only `frontend/`.

`frontend/public-config.js` holds only the configured public backend origin and Google OAuth web client ID. Empty settings show a setup screen and make no financial API requests. Never put Sheet IDs, account emails, keys, credentials, financial exports or screenshots here.

## Development

Serve `frontend/` with a local static server. Assets use relative paths so the site can be hosted below a repository path. The private backend must explicitly allow the deployed Pages origin.

Run `python scripts/check_publish.py` before committing or publishing. This guard rejects tracked files outside the explicit public allowlist, backend files, symlinks, private credential material, private Drive references and embedded financial payloads. Keep all original statements, workbooks, receipts and backend source outside this repository.

Financial API responses are requested without browser caching. Sign-in credentials remain in memory; signing out clears the view and reloads the page. AI summaries are not connected until a separate web provider is configured. Numerical charts and calculations do not need AI.
