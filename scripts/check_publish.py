"""Public-interface allowlist. The private backend and all financial files are excluded."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = frozenset(['frontend/month-budget.js', 'frontend/refresh-ui.js', 'frontend/experience.css', 'frontend/privacy.html', 'frontend/assistant.js', 'frontend/accounts.css', 'frontend/accounts.js', 'frontend/analysis-ui.js', 'frontend/analysis.css', 'frontend/analytics.js', 'frontend/app.js', 'frontend/category-visuals.js', 'frontend/chrome.css', 'frontend/cloud-ui.css', 'frontend/cloud-ui.js', 'frontend/evidence-ui.js', 'frontend/documents.js', 'frontend/documents.css', 'frontend/growth.js', 'frontend/icon.svg', 'frontend/index.html', 'frontend/manifest.webmanifest', 'frontend/navigation.js', 'frontend/overview-charts.css', 'frontend/overview-charts.js', 'frontend/planning.css', 'frontend/planning.js', 'frontend/polish.css', 'frontend/portfolio.css', 'frontend/portfolio.js', 'frontend/public-config.js', 'frontend/review-ui.css', 'frontend/review-ui.js', 'frontend/styles.css', 'frontend/theme.js', 'frontend/transaction-filters.css', 'frontend/transaction-filters.js', 'frontend/web-session.js', 'frontend/web.css'] + [
    '.gitignore', 'README.md', 'scripts/check_publish.py', '.github/workflows/pages.yml',
])
PRIVATE_CONTENT = re.compile(
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    r'|[\"\']private_key[\"\']\s*:'
    r'|[\"\'](?:charged_amount|income_neal_clp|income_partner_clp)[\"\']\s*:\s*[-+]?\d'
    r'|https://(?:docs\.google\.com/spreadsheets/d|drive\.google\.com/drive/folders)/[A-Za-z0-9_-]{15,}'
)


def validate(paths):
    errors = []
    for name in sorted(set(paths)):
        path = ROOT / name
        if name not in ALLOWED:
            errors.append(name + ': outside the public interface allowlist')
            continue
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT.resolve()):
            errors.append(name + ': expected a regular file inside this checkout')
            continue
        try:
            content = path.read_text(encoding='utf-8')
        except (OSError, UnicodeError):
            errors.append(name + ': expected a readable text asset')
            continue
        if PRIVATE_CONTENT.search(content):
            errors.append(name + ': private credential, financial payload or private Drive reference')
    return errors


def main():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    # The deployment artifact must be safe even if an untracked file was added locally.
    artifact = [str(path.relative_to(ROOT)) for path in (ROOT / 'frontend').rglob('*') if path.is_file() or path.is_symlink()]
    errors = validate([name for name in tracked if name] + artifact)
    if errors:
        raise SystemExit('\n'.join(errors))
    if not (ROOT / 'frontend/index.html').is_file():
        raise SystemExit('The public interface entry point is missing.')
    print('Public interface verified: frontend assets only; no backend or financial files.')


if __name__ == '__main__':
    main()
