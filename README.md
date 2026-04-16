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
| `Ctrl+S` | Stash current editor text |
| `Ctrl+Alt+S` | Stash with a message |

### Commands

| Command | Action |
|---------|--------|
| `/stash` | List all stashes |
| `/stash list` | List all stashes |
| `/stash pop` | Select a stash → paste into editor, remove from stash |
| `/stash apply` | Select a stash → paste into editor, keep in stash |
| `/stash drop` | Select a stash and delete it |
| `/stash clear` | Drop all stashes (with confirmation) |

## Configuration

Keybindings are configurable via `~/.pi/stash-config.json`:

```json
{
  "stash": "ctrl+s",
  "stashWithMessage": "ctrl+alt+s"
}
```

Only include keys you want to override. `/reload` after editing.

## Storage

Stashes persist in `~/.pi/stash.json` across all sessions and projects.

## License

MIT
