# @knockio/react-native-kanban

Independent React Native Kanban board. No Redux, navigation, or app UI kit.

Source is published as-is so Metro and `react-native-reanimated` worklets compile in the **host app**.

## Install

```bash
npm install @knockio/react-native-kanban
```

Peer dependencies (host app):

```bash
npm install react-native-reanimated react-native-gesture-handler react-native-vector-icons
```

In the host app:

1. Wrap the tree with `GestureHandlerRootView`.
2. Keep `react-native-reanimated/plugin` **last** in `babel.config.js`.

## Usage

```tsx
import { KanbanBoard, KanbanThemeProvider } from "@knockio/react-native-kanban";
import type { KanbanCard, DragData } from "@knockio/react-native-kanban/types";

<KanbanThemeProvider theme={{ primary: "#4FAA3A" }}>
  <KanbanBoard
    board={board}
    onCardMove={(drag: DragData) => {}}
    onCardPress={(card: KanbanCard) => {}}
    emptyText="No items"
    enableDrag
  />
</KanbanThemeProvider>
```

Board shape: `{ id, title, columns }`.  
Column: `{ id, title, cards, color? }`.  
Card: `{ id, title, description? }`. Extra app data goes on `originalData`.

Inject trailing buttons (call, SMS, …) with `renderCardActions`.  
Theme tokens go through `KanbanThemeProvider` or the `theme` prop.

## GitHub

This package lives in its own repo: [Knockio/react-native-kanban](https://github.com/Knockio/react-native-kanban).

```bash
git clone https://github.com/Knockio/react-native-kanban.git
cd react-native-kanban
```

## Publish to npm

Requires an npm account and access to the `@knockio` org (or change `"name"` in `package.json`).

```bash
npm login
npm pack --dry-run
npm publish --access public
```

Then in any app:

```bash
npm install @knockio/react-native-kanban
```
