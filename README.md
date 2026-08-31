# JSON Studio Web V8

JSON Studio is a browser-based visual JSON analyzer and composer designed to deploy directly to Vercel.

## What changed in V8

V8 removes the requirement to start from a sample. The application now supports three equivalent entry paths:

1. **Create from scratch** — start with an empty JSON object or array.
2. **Analyze a sample** — optionally discover recurring structures, field frequency, enums and GUID/UUID references.
3. **Open existing JSON** — continue editing an existing document.

### Guided components

Inside **Build**, use **Create guided component** to define a reusable object without writing JSON manually:

- Component name
- Property keys
- Real JSON types (`string`, `number`, `boolean`, `object`, `array`, `null`)
- Initial primitive values
- Live JSON preview

Guided components are stored locally in the browser and appear in **My components**. They can be dragged into either the Visual Builder or the raw JSON editor.

### Drag & drop inside the JSON text editor

The Monaco JSON editor is now a semantic drop target. While dragging a component over the editor, JSON Studio resolves the object/array under the pointer and inserts the component into that container instead of blindly pasting text. The document is then regenerated as valid formatted JSON.

Dropping into Monaco is disabled while the JSON text is invalid, preventing accidental corruption of the document.

### Optional sample analysis

Sample analysis remains available and still provides:

- recurring object clustering
- minimal / recommended structures
- required / common / optional / rare fields
- enum and constant detection
- GUID / UUID indexing
- readable reference aliases
- parent/child component hierarchy
- discovered components in the same drag-and-drop library

## Stack

- React 19
- TypeScript
- Vite
- Ant Design
- Monaco Editor
- `jsonc-parser` for semantic drop targeting inside Monaco

Everything runs in the browser. No backend is required for V8.

## Run locally

```bash
npm install
npm run dev
```

Vite normally serves the application at `http://localhost:5173`.

## Production build

```bash
npm run build
```

The output is generated in `dist/`.

## Vercel

The repository includes `vercel.json`. Import the repository into Vercel and use the standard Vite build:

- Build command: `npm run build`
- Output directory: `dist`

## Language

English is the default interface language. Users can switch between English and Spanish from the header. The preference is stored locally in the browser and does not modify JSON keys or values.
