# Gerardo's awesome JSON Studio — V14

Web-first JSON builder, analyzer and data mapper designed for Vercel.

## V14 — Formula Mapping Discovery

V14 can learn JSON-generation logic that already exists inside an Excel workbook.

When a workbook contains formulas that assemble JSON (or JSON-like text), JSON Studio now:

- detects likely formula-generated JSON output columns;
- reads the workbook formulas instead of treating every Excel column as an unrelated field;
- traces A1 references and ranges through helper formula columns;
- recognizes lookup/derived logic such as `XLOOKUP`, `VLOOKUP`, `INDEX` and `MATCH`;
- compares generated JSON values across rows with workbook columns to infer source relationships;
- classifies learned JSON fields as **Direct**, **Derived**, **Constant** or **Unresolved**;
- understands semantic paths inside named arrays, e.g. `attributes[attributeKey="cardPower"].attributesValue`;
- normalizes equivalent rule representations so formula-generated named rule arrays can teach a JSON guide that stores rules as objects;
- can apply the learned mapping to the current JSON guide while preserving its structure and unmapped constants;
- can alternatively use the workbook's generated JSON output directly when the detected output is usable;
- reports partial/invalid generated rows instead of silently treating malformed JSON-like text as valid JSON;
- keeps the formula logic inspectable so users can see the helper columns and raw dependencies behind a generated field.

### Two formula-aware actions

**Apply learned mapping (recommended)**

Keeps the JSON guide as the source of truth for structure. Excel formulas are used to learn which workbook data populates each target field. This is the safer mode when the workbook's generated JSON has legacy syntax differences or a different representation.

**Use generated JSON**

Uses the JSON objects already produced by the spreadsheet formula output. Only rows with a readable generated object are used, and the normal row filters still apply.

## Existing capabilities

- Guided JSON creation without a sample.
- JSON sample analysis and reusable component discovery.
- Visual component builder + raw Monaco JSON editor.
- Drag & drop into the visual builder and JSON editor.
- GUID/UUID reference discovery and aliases.
- Excel / CSV import and column-to-JSON mapping.
- Template-guided Excel population with Replace / Append modes.
- Automatic Excel header-row detection and boolean row filters.
- Persistent 50/50 Excel mapping + JSON preview workspace.
- English UI by default, with Spanish toggle.
- Browser-local processing; no backend is required for the core workflow.

## Install

```bash
npm install
npm run dev
```

## Build for Vercel

```bash
npm run build
```

Output: `dist`
