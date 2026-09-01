# Gerardo's awesome JSON Studio — V13

Web-first JSON builder and mapper for Vercel.

## V13 — clearer JSON guide + Excel mapping

Template-guided Excel mapping is now **target-first**:

- JSON target fields are the primary list (not all Excel columns).
- Each target field can either **Preserve guide value** or map from one Excel column.
- Unused Excel columns are ignored instead of being added to the JSON automatically.
- Constant fields in the JSON guide are detected and preserved by default.
- Repeated object arrays with identity keys (for example `attributes[attributeKey="cardAddresses"]`) are exposed as semantic target paths.
- Auto-mapping combines header similarity with value overlap. This can infer cases such as a `Simplex` Excel column feeding JSON `pid` when the values match existing guide examples.
- Excel header rows are detected automatically instead of assuming row 1. This is important for workbooks that contain title / metadata rows above the actual table.
- Optional row filtering is available before population. Boolean columns such as `Add to Module.json` are suggested automatically.
- The preview defaults to **one generated item**, making it easy to understand what one Excel row becomes. A full JSON preview is still available.
- The right-side preview remains persistent while mapping.

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
