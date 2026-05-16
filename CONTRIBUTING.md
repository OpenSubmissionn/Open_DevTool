# Contributing to Open

Thanks for considering a contribution. This document covers the basics for
getting set up, the conventions we follow, and how to send a useful PR.

## Getting started

```bash
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build
npm run test:all
```

You need Node.js 20+ (some deps require Node 20: `commander@14`, `ora`,
`vitest@4`, etc.). The project uses npm workspaces — `cli`, `services`,
and `scripts` live under one root.

## Project layout

| Path | Purpose |
|---|---|
| `cli/` | CLI entry point (`open` binary), commands, terminal renderer |
| `services/` | Analysis engine, RPC layer, decoders, MCP client, program registry |
| `scripts/` | Validation and benchmark scripts (decoders, registry, latency) |
| `docs/` | Architecture, troubleshooting, schema references |

## Development workflow

```bash
# Run the CLI locally without building
npm run cli -- tx <signature> --network mainnet

# Type-check everything
npx tsc --noEmit -p services/tsconfig.json
npx tsc --noEmit -p cli/tsconfig.json

# Format
npm run format

# Lint
npm run lint

# Run tests
npm run test:unit
npm run test:integration
npm run test:all

# Validate the decoder registry
npm run validate:decoders
```

Before opening a PR, make sure:

- `npm run test:unit` passes
- `npm run validate:decoders` passes 30/30
- `npm run lint` is clean
- `npx prettier --check "**/*.{ts,tsx,json,md}"` passes

## Adding a new protocol decoder

See `docs/Decoders.md` (Part B — Adding a new decoder) for the full step-by-step. Briefly:

1. Add the IDL under `services/src/analysis/decoders/<protocol>/` (or
   `anchor-defs/` for Anchor-only IDLs).
2. Register the program in `services/src/data/program-registry.json`.
3. Add a fixture transaction under `services/tests/fixtures/`.
4. Add a unit test under `services/tests/analysis/`.
5. Run `npm run validate:decoders` — it must pass 6/6 checks for the new entry.

## Commit style

We use Conventional Commits:

```
fix(scope): short description

Longer body explaining why, not what.
```

Common scopes: `cli`, `services`, `decoders`, `mcp`, `docs`, `tests`, `ci`.

## Reporting bugs

Open an issue with:

- The transaction signature (or the input you used)
- The exact command you ran
- The full output (use `--verbose`)
- Your Node.js version (`node --version`)
- OS and terminal

For security issues, email the maintainers directly rather than opening a
public issue.

## License

By contributing, you agree your contributions will be licensed under the
MIT License (see `LICENSE`).
