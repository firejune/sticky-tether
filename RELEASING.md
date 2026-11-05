# Releasing

Releases are automated via [`.github/workflows/release.yml`](.github/workflows/release.yml) using `release-please` and npm OIDC trusted publishing (`--provenance`).

## One-time setup

1. **GitHub**: **Settings → Actions → General → Workflow permissions** → enable *"Allow GitHub Actions to create and approve pull requests."*
2. **npm (`npmjs.com`)**: Package **Settings → Trusted Publisher → GitHub Actions**:
   - Organization or user: `firejune`
   - Repository: `sticky-tether`
   - Workflow filename: `release.yml`
   - Environment name: *(blank)*
