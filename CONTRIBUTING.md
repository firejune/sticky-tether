# Contributing

Thanks for looking into `sticky-tether`.

## Before opening a pull request

CI runs these checks on Node 22:

```bash
npm ci
npm run build
npm run typecheck
npm test
```

## Commits and pull requests

Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `docs:`, `test:`, `chore:`. Every change lands on `main` via a squash-merged pull request, and `release-please` derives the next version and changelog from the commit subjects.

## License

Contributions are accepted under the [MIT License](LICENSE).
