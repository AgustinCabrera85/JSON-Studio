# Gerardo's awesome JSON Studio — Web V9

A browser-first JSON composition tool built with React, TypeScript, Vite and Ant Design. The application is designed for static deployment on Vercel and keeps JSON/Excel analysis in the user's browser.

## What changed in V9

### Excel → JSON
Excel is now a first-class optional data source. From **Start** choose **Import Excel data** and load `.xlsx`, `.xls` or `.csv`.

The mapper:

- detects workbook sheets and row counts;
- uses the first non-empty row as headers;
- profiles each column (dominant type, unique values and repetition);
- suggests useful JSON shapes:
  - Array of records;
  - Named collection;
  - Object indexed by a unique ID/code-like column;
  - Grouped collection when a repeated categorical column is detected;
- previews the source rows;
- lets the user include/exclude columns;
- lets the user rename each JSON key;
- accepts dot paths such as `customer.name` to create nested JSON objects;
- lets the user override the resulting real JSON type;
- treats detected dates as JSON `string` values, because JSON has no native date type;
- shows a live JSON preview;
- generates the mapped result and opens it directly in the existing Builder;
- can save the mapped row schema as a reusable **My component** item.

Excel parsing is loaded lazily with `xlsx`, so the spreadsheet library does not need to be part of the initial UI chunk.

### Existing V8 capabilities preserved

- Start without a sample: object or array root.
- Optional JSON sample analyzer.
- Recurring-structure clustering and minimal/recommended structures.
- GUID/UUID detection, aliases and references.
- Guided reusable components stored locally.
- Visual object/array builder.
- Drag & drop from Components to the Visual Builder.
- Semantic drag & drop from Components directly into the Monaco JSON editor.
- EN/ES interface switcher; English is the default for new users.
- Vercel static deployment; no backend required.

## Branding

The product name displayed in the header and document title is:

**Gerardo's awesome JSON Studio**

The product name is not translated when switching the interface language.

## Development

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite (normally `http://localhost:5173`).

## Production / Vercel

```bash
npm run build
```

Vite outputs to `dist/`. `vercel.json` already declares Vite, `npm run build`, and `dist`.

## Important implementation notes

- All JSON analysis, Excel parsing and mapping run in the browser.
- JSON data and Excel workbooks are not uploaded to an application backend by this implementation.
- Custom guided components and language preference are stored in browser local storage.
- Excel V9 maps one selected sheet at a time. The sheet selector allows switching between sheets before generation.
- For complex relational workbooks, cross-sheet joins/nested relation mapping are a logical next extension.

## V10 — Compact Excel mapping workspace

The Excel workflow was redesigned to prevent wide/tall workbooks from stretching the whole page.

- Sticky context bar with workbook, sheet, row/column counts, mapped column count and selected output shape.
- Output shape stays visible as a compact configuration strip.
- Column mapping is the primary fixed section and scrolls internally.
- Column rows are denser: detected type is shown inline with the source column and sample values are available by tooltip.
- Search and “included only” filters help with large worksheets.
- Suggested structures, source-data preview and mapped-JSON preview are collapsible secondary sections.
- Excel and JSON previews have bounded internal scroll areas so they never make the page grow indefinitely.
- Primary “Generate JSON” action stays in the sticky context bar.
- The compact Excel workspace remains fully bilingual (English default, Spanish available).

## v0.10.1 hotfix

- Fixed Excel upload/runtime crash introduced in v0.10.0 compact mapper refactor.
- `Table` from Ant Design is now explicitly imported before the Excel data preview is rendered.

## V11 — Split mapping workspace

The Excel mapper now uses a two-column working layout on desktop:

- **Left half:** output shape, column mapping, structure suggestions, and Excel source preview.
- **Right half:** a persistent live JSON preview that remains visible while mapping changes are made.
- Left-side sections are individually collapsible. Output Shape and Column Mapping open by default; Suggestions and Excel Preview start collapsed.
- Quick actions let the user **Collapse all** or restore the **essential** panels.
- The JSON preview has its own independent scroll area and keeps the current output shape and Generate JSON action visible.
- Both columns scroll independently, so collapsing upper panels immediately exposes the lower sections without losing the JSON context.
- Below tablet/compact desktop widths the layout falls back to a single column, keeping the JSON preview usable beneath the mapper.
