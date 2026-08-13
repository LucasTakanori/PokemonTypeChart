# Typewise — Pokémon Type Chart Quiz

Typewise is an interactive memory trainer for the modern 18-type Pokémon matchup chart (Generation VI onward). Swap the chart axes at any time to practice with attacking or defending types as rows.

Live site: [pokemon-type-chart-delta.vercel.app](https://pokemon-type-chart-delta.vercel.app)

## Features

- Full 18 × 18 chart with all 324 single-type matchups
- `×0`, `×½`, `×1`, and `×2` answer palette
- Unmarked cells default to `×1`, matching the usual compact type-chart convention
- One-button feedback toggle between instant correction and whole-table scoring
- Reversible attacking/defending axis swap with visual keyboard navigation
- Persistent light and dark themes
- Mobile row view, sticky controls, keyboard shortcuts, and accessible labels
- Balanced Quick Quiz covering all four effectiveness categories
- Progress saved locally in the browser

## Run locally

This is a framework-free static site. Serve the repository directory with any local server, for example:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

Run the data and asset tests with:

```powershell
npm test
```

## Type icon attribution

The 18 type SVGs in `assets/type-icons/` come from [`partywhale/pokemon-type-icons`](https://github.com/partywhale/pokemon-type-icons) at commit `fcbe6978c61c359680bc07636c3f9bdc0f346b43`. They are used under the MIT License; the complete notice is preserved in [`THIRD_PARTY_LICENSES/pokemon-type-icons-MIT.txt`](THIRD_PARTY_LICENSES/pokemon-type-icons-MIT.txt).

## Disclaimer

This is an unofficial, fan-made learning tool. Pokémon and related names and marks belong to their respective owners. This project is not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK, or The Pokémon Company.
