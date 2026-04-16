# pi-stash

Git-style prompt stashing for [pi](https://github.com/badlogic/pi-mono).

Save what you're typing, clear the editor, and come back to it later.

## Install

Copy `prompt-stash.ts` to your global extensions directory:

```bash
cp prompt-stash.ts ~/.pi/agent/extensions/
```

Or symlink it:

```bash
ln -s "$(pwd)/prompt-stash.ts" ~/.pi/agent/extensions/prompt-stash.ts
```

Then `/reload` in pi.

## Usage

### Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Q` | Stash current editor text |
| `Ctrl+Shift+Q` | Stash with a message |

### Commands

| Command | Action |
|---------|--------|
| `/stash` | Interactive stash picker |
| `/stash list` | Interactive stash picker |
| `/stash pop` | Picker locked to pop mode |
| `/stash apply` | Picker locked to apply mode |
| `/stash drop` | Picker locked to drop mode |
| `/stash clear` | Drop all stashes (with confirmation) |

### Picker Keys

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` | Apply or pop (configurable, default: apply) |
| `a` | Apply — paste into editor, keep stash |
| `p` | Pop — paste into editor, remove stash |
| `d` | Drop — delete stash without pasting |
| `Esc` | Close picker |

## Configuration

All settings in `~/.pi/stash-config.json`:

```json
{
  "stash": "ctrl+q",
  "stashWithMessage": "ctrl+shift+q",
  "enterAction": "apply"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `stash` | `ctrl+q` | Quick stash shortcut |
| `stashWithMessage` | `ctrl+shift+q` | Stash with message shortcut |
| `enterAction` | `"apply"` | What Enter does in the picker: `"apply"` or `"pop"` |

Only include keys you want to override. `/reload` after editing.

## Storage

Stashes persist in `~/.pi/stash.json` across all sessions and projects.

## License

MIT
