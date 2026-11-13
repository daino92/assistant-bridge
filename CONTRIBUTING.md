# Contributing

## Development

```bash
pnpm install
pnpm build          # Compile the SDK, declarations and schemas
pnpm typecheck      # Check SDK source and tests
pnpm test           # Run SDK unit tests
pnpm lint           # Check coding conventions
pnpm format:check   # Check formatting
```

`pnpm build` emits JavaScript and declarations, rewrites internal aliases and extensionless imports, and generates the protocol schemas. Generated schemas and the pnpm lockfile are excluded from Prettier.

`pnpm package:check` packs the SDK, inspects the archive and installs it in two temporary consumers. It needs registry access and the `tar` command.

## Releases

Releases follow Git Flow. Merging into `main` does not publish; pushing a release tag does.

1. Create `release/X.Y.Z` (or `release/X.Y.Z-beta.N`) from `develop`. Set `version` in `package.json` and rename `## Unreleased` in `CHANGELOG.md` to the version.
2. Open a pull request from the release branch into `main` and merge it once CI passes.
3. Tag the merge commit and push the tag: `git tag -a vX.Y.Z -m vX.Y.Z <merge-commit> && git push origin vX.Y.Z`.
4. Open a pull request from `main` into `develop` to back-merge the release.

`.github/workflows/publish.yml` runs on `v*` tags. It fails unless the tag equals `v` + `package.json` version and points at a commit on `main`, validates the package and publishes with provenance. Prerelease versions (`-beta.N`) use the npm `beta` dist-tag; stable versions use `latest`. Versions already on npm are skipped.

Publishing uses an npm trusted publisher, so no token is required. Configure it in the npm package settings:

- Organization or user: `daino92`
- Repository: `assistant-bridge`
- Workflow filename: `publish.yml`
- Environment name: leave empty

npm accepts provenance only from public source repositories.
