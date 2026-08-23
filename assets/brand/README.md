# cerrojo — brand mark

A cartoon wallet with a spreadsheet tucked into its head and a keyhole holding
its flap shut. The story is the product: it reads the sheet, it keeps the money, and
it does not open past its own line — however loudly the sheet asks.

## Files

| File | Use |
|---|---|
| `cerrojo-mark.svg` | The character alone, transparent. Docs, slides, README. |
| `cerrojo-badge.svg` | App icon / avatar on a dark badge. Default. |
| `cerrojo-badge-light.svg` | Same badge on cream, for dark surfaces. |
| `cerrojo-lockup.svg` | Badge + wordmark + tagline, on light. |
| `cerrojo-lockup-dark.svg` | Lockup on dark, with a green badge. |
| `cerrojo-favicon.ico` | Multi-size ICO (16/32/64). Installed as `web/src/app/favicon.ico`. |
| `png/` | Rasters: badge at 512/256/180/128/64/32/16, mark at 512, lockups at 2x. |

## Palette

| Token | Hex | Where |
|---|---|---|
| ink | `#14231F` | Every outline, pupils, keyhole |
| green | `#2FB98F` | Body |
| green deep | `#17795E` | Flap (the closed mouth) |
| amber | `#F5B23F` | Clasp, the one capped cell |
| cream | `#FFF4E0` | The spreadsheet, light badge, on-dark wordmark |
| night | `#0E1A17` | Dark badge |

## Notes

* The wordmark uses Nunito 800 with a `Trebuchet MS` / `Segoe UI` fallback. Where the font
  is not guaranteed, ship `png/cerrojo-lockup@2x.png` instead of the SVG.
* The web app reads these through the Next.js app-directory convention: `web/src/app/icon.svg`,
  `apple-icon.png`, `favicon.ico`. Files dropped in `web/public/` are ignored by that convention.
* Minimum size for the badge is 32 px; below that the spreadsheet stops reading.
* Do not recolor the outlines. The mark holds together because everything is one ink.
