# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HEXA Matrix Tracker is a static web application for tracking MapleStory HEXA Matrix skill progression. It helps players manage node leveling across multiple character profiles, calculate resource costs, and follow optimized upgrade priority sequences.

## Architecture

### Script Loading Order (Critical)

The application has strict load-order dependencies defined in index.html:12-67:

```
data.js → classes/*.js → app.js
```

- **data.js**: Defines cost tables, helper functions (`costToLevel`, `costBetween`), constants, and the empty `PRIORITY_CONFIG` object
- **classes/*.js**: One file per class (kebab-case name), each assigning `PRIORITY_CONFIG["Class Name"] = { nodes, priorities }`
- **app.js**: Application state, rendering logic, and event handlers

Do NOT reorder these scripts or convert to modules without careful consideration of global dependencies.

### Data Flow

1. **State Management**: Single global `state` object in app.js storing all profiles and current selection
2. **localStorage Persistence**: State auto-saves to `localStorage` on every change using the `STORAGE_KEY` constant
3. **Render Cycle**: Full re-render via `render()` function after any state mutation
4. **Event Attachment**: Event handlers are re-attached after each render via `attachEvents()`

### Key Architecture Patterns

**Profile Structure** (app.js:20-32):
```javascript
{
  classKey: "Hoyoung",           // Maps to PRIORITY_CONFIG
  nodes: [...],                   // Built from template in buildNodesFromTemplate()
  presetName: "All",              // Selected priority preset name
  fragOwned: 0,                   // User-entered resource count
  fragPerDay: 0                   // User-entered daily acquisition rate
}
```

**Node Structure** (app.js:11-17):
```javascript
{
  id: uid(),                      // Unique runtime ID
  key: "harmony",                 // Template key for priority matching
  name: "Universal Harmony",      // Display name
  type: "mastery",                // Maps to COST_TABLE in data.js
  level: 0                        // Current level (0-30)
}
```

**Priority Configuration** (classes/*.js):
- Each class has a `nodes` array (template) and `priorities` object (preset sequences)
- Priority sequences are arrays of `[nodeKey, targetLevel]` or `["NOTE", "message"]`
- The sequence tab simulates leveling order and calculates cumulative costs

### Important Constraints

1. **Read-Only Configuration**: Node lists and priority orders are intentionally locked to prevent user tampering. Only node levels are editable in the UI.

2. **Fragment Limitation**: The UI enforces `MAX_LEVEL = 30` defined in data.js:208

3. **Cost Accuracy**: Cost tables in data.js are verified against official source data. Do not modify without verification.

4. **Import/Export Format**: Export creates a minimal JSON structure with only `class` and `nodes[].key/level`. Import rebuilds full profiles from templates.

## Development Commands

This is a vanilla HTML/CSS/JS project with no build system. To develop:

```bash
# Serve locally (any static server works)
python3 -m http.server 8000
# or
npx serve .

# Then open http://localhost:8000
```

## Common Tasks

### Adding a New Character Class

1. Create `classes/<class-name>.js` assigning `PRIORITY_CONFIG["Class Name"]` (copy an existing class file) and add a `<script>` tag for it in index.html before app.js
2. Define `nodes` array with `key`, `name` (optional), `type`, and starting `level`
3. Add one or more priority presets in the `priorities` object
4. Update `defaultState()` in app.js (classes now appear by default automatically)

### Modifying Priority Sequences

Edit the `priorities` object in the relevant `classes/*.js` file. Use:
- `["nodeKey", targetLevel]` for upgrade steps
- `["NOTE", "message text"]` for informational markers

### Adjusting Cost Tables

Only modify `COST_TABLE` in data.js if you have verified source data. Each array entry is `[solErdas, fragments]` for levels 1-30.

### Debugging localStorage Issues

Clear saved state:
```javascript
localStorage.removeItem('hexaMatrixTrackerData')
```

Inspect current state:
```javascript
console.log(JSON.parse(localStorage.getItem('hexaMatrixTrackerData')))
```

## File Reference

- **index.html**: Entry point, defines load order
- **app.js**: State management, rendering, event handling (472 lines)
- **data.js**: Cost tables and calculation utilities (226 lines)
- **classes/*.js**: One file per class: node configurations and priority sequences
- **style.css**: Dark-themed styling with CSS variables

## Key Functions

- `buildNodesFromTemplate(classKey)` (app.js:8): Constructs node array from PRIORITY_CONFIG
- `costBetween(type, from, to)` (data.js:222): Calculates upgrade cost between two levels
- `render()` (app.js:89): Main render function, triggers full UI rebuild
- `attachEvents()` (app.js:295): Binds all event handlers after render
- `saveState()` (app.js:52): Persists state to localStorage
- `profileFromImportEntry(entry)` (app.js:64): Rebuilds profile from import data
