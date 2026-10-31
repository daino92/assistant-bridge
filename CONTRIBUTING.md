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

Update `version` in `package.json` and `CHANGELOG.md`, then merge to `main`. `.github/workflows/publish.yml` validates the package and publishes new versions with the `beta` tag and provenance. Versions already on npm are skipped.

Publishing uses an npm trusted publisher, so no token is required. Configure it in the npm package settings:

- Organization or user: `daino92`
- Repository: `assistant-bridge`
- Workflow filename: `publish.yml`
- Environment name: leave empty

npm accepts provenance only from public source repositories.
