/**
 * Prompt Stash — git-style stashing for your editor prompts.
 *
 * Shortcuts (configurable via ~/.pi/stash-config.json):
 *   Ctrl+Q             — quick stash (no message)
 *   Ctrl+Shift+Q       — stash with a message
 *
 * Commands:
 *   /stash             — interactive stash picker
 *   /stash list        — interactive stash picker
 *   /stash pop         — pick a stash, paste into editor, remove it
 *   /stash apply       — pick a stash, paste into editor, keep it
 *   /stash drop        — pick a stash and delete it
 *   /stash clear       — drop every stash
 *
 * Stash picker keys:
 *   j/k or ↑/↓         — move up/down
 *   Enter               — apply or pop (configurable)
 *   a                   — apply (paste, keep stash)
 *   p                   — pop (paste, remove stash)
 *   d                   — drop (delete without pasting)
 *   Esc                 — close
 *
 * Stashes persist in ~/.pi/stash.json across sessions.
 *
 * Config (~/.pi/stash-config.json):
 *   {
 *     "stash": "ctrl+q",
 *     "stashWithMessage": "ctrl+shift+q",
 *     "enterAction": "apply"
 *   }
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { matchesKey, Key, truncateToWidth, Container, Text } from "@earendil-works/pi-tui";

// ── Types ───────────────────────────────────────────────────

interface StashEntry {
	id: number;
	text: string;
	message: string;
	timestamp: number;
}

interface StashStore {
	nextId: number;
	entries: StashEntry[];
}

interface StashConfig {
	stash: string;
	stashWithMessage: string;
	enterAction: "apply" | "pop";
}

type PickerAction = "apply" | "pop" | "drop";
interface PickerResult {
	index: number;
	action: PickerAction;
}

// ── Paths & defaults ────────────────────────────────────────

const HOME = homedir();
const STASH_FILE = `${HOME}/.pi/stash.json`;
const CONFIG_FILE = `${HOME}/.pi/stash-config.json`;

const DEFAULT_CONFIG: StashConfig = {
	stash: "ctrl+q",
	stashWithMessage: "ctrl+shift+q",
	enterAction: "apply",
};

// ── Config (sync — needed at extension load time) ───────────

function loadConfig(): StashConfig {
	try {
		const raw = readFileSync(CONFIG_FILE, "utf8");
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

// ── Store (async) ───────────────────────────────────────────

async function loadStore(): Promise<StashStore> {
	try {
		const raw = await readFile(STASH_FILE, "utf8");
		return JSON.parse(raw) as StashStore;
	} catch {
		return { nextId: 0, entries: [] };
	}
}

async function saveStore(store: StashStore): Promise<void> {
	await mkdir(dirname(STASH_FILE), { recursive: true });
	await writeFile(STASH_FILE, JSON.stringify(store, null, 2), "utf8");
}

// ── Formatting ──────────────────────────────────────────────

function formatStashLine(
	entry: StashEntry,
	index: number,
	selected: boolean,
	theme: Theme,
): string {
	const date = new Date(entry.timestamp);
	const ts = date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
	const ref = `stash@{${index}}`;
	const msg = entry.message ? `: ${entry.message}` : "";
	const preview = entry.text.replace(/\n/g, "↵ ").slice(0, 50);

	const pointer = selected ? theme.fg("accent", "❯ ") : "  ";
	const refStyled = selected ? theme.fg("accent", ref) : theme.fg("muted", ref);
	const msgStyled = selected ? theme.fg("text", msg) : theme.fg("dim", msg);
	const tsStyled = theme.fg("dim", ts);
	const previewStyled = theme.fg("dim", preview + (entry.text.length > 50 ? "…" : ""));

	return `${pointer}${refStyled}${msgStyled}  ${tsStyled}  ${previewStyled}`;
}

// ── Extension ───────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const config = loadConfig();

	// ── Shortcuts ───────────────────────────────────────────
	pi.registerShortcut(config.stash, {
		description: "Stash current editor text, or open picker if editor is empty",
		handler: async (ctx) => {
			const editorText = ctx.ui.getEditorText?.();
			if (!editorText || editorText.trim().length === 0) {
				return openPicker(ctx);
			}
			return pushStash(ctx, false);
		},
	});

	pi.registerShortcut(config.stashWithMessage, {
		description: "Stash current editor text with a message",
		handler: async (ctx) => pushStash(ctx, true),
	});

	// ── /stash command ──────────────────────────────────────
	pi.registerCommand("stash", {
		description: "Interactive stash picker. Sub-commands: pop, apply, drop, clear",
		getArgumentCompletions: (prefix: string) => {
			const subs = ["list", "pop", "apply", "drop", "clear"];
			const filtered = subs
				.filter((s) => s.startsWith(prefix))
				.map((s) => ({ value: s, label: s }));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (trimmed === "" || trimmed === "list") return openPicker(ctx);
			if (trimmed === "pop") return openPicker(ctx, "pop");
			if (trimmed === "apply") return openPicker(ctx, "apply");
			if (trimmed === "drop") return openPicker(ctx, "drop");
			if (trimmed === "clear") return clearStashes(ctx);

			ctx.ui.notify(`Unknown sub-command: ${trimmed}`, "warning");
		},
	});

	// ── Helpers ──────────────────────────────────────────────

	async function pushStash(ctx: any, promptForMessage: boolean) {
		const editorText = ctx.ui.getEditorText?.();
		if (!editorText || editorText.trim().length === 0) {
			ctx.ui.notify("Nothing to stash — editor is empty.", "warning");
			return;
		}

		let message = "";
		if (promptForMessage) {
			const input = await ctx.ui.input("Stash message:", "");
			if (input == null) return;
			message = input.trim();
		}

		const store = await loadStore();
		const entry: StashEntry = {
			id: store.nextId++,
			text: editorText,
			message,
			timestamp: Date.now(),
		};
		store.entries.unshift(entry);
		await saveStore(store);

		ctx.ui.setEditorText?.("");
		ctx.ui.notify(
			`Saved stash@{0}${entry.message ? `: ${entry.message}` : ""}`,
			"info",
		);
	}

	async function openPicker(ctx: any, forceAction?: PickerAction) {
		const store = await loadStore();
		if (store.entries.length === 0) {
			ctx.ui.notify("No stashes.", "info");
			return;
		}

		const result = await ctx.ui.custom<PickerResult | null>(
			(tui: any, theme: Theme, _kb: any, done: (r: PickerResult | null) => void) => {
				let selected = 0;
				const entries = store.entries;

				const container = new Container();
				const topBorder = new DynamicBorder((s: string) => theme.fg("accent", s));
				const title = new Text("", 1, 0);
				const list = new Text("", 1, 0);
				const help = new Text("", 1, 0);
				const bottomBorder = new DynamicBorder((s: string) => theme.fg("accent", s));

				container.addChild(topBorder);
				container.addChild(title);
				container.addChild(list);
				container.addChild(help);
				container.addChild(bottomBorder);

				const enterLabel = config.enterAction === "pop" ? "pop" : "apply";

				function rebuild() {
					title.setText(theme.fg("accent", theme.bold(" Stashes")) + theme.fg("dim", ` (${entries.length})`));

					if (entries.length === 0) {
						list.setText(theme.fg("dim", "  No stashes."));
						help.setText(theme.fg("dim", " esc close"));
						return;
					}

					const lines = entries.map((e, i) =>
						formatStashLine(e, i, i === selected, theme),
					);
					list.setText(lines.join("\n"));

					const hints = forceAction
						? `enter ${forceAction} • esc cancel`
						: `enter ${enterLabel} • a apply • p pop • d drop • j/k ↑/↓ navigate • esc close`;
					help.setText(theme.fg("dim", ` ${hints}`));
				}

				rebuild();

				function dropSelected() {
					if (entries.length === 0) return;
					const entry = entries[selected];
					const ref = `stash@{${selected}}${entry.message ? `: ${entry.message}` : ""}`;
					entries.splice(selected, 1);
					saveStore(store);
					if (selected >= entries.length && selected > 0) selected--;
					rebuild();
					tui.requestRender();
					ctx.ui.notify(`Dropped ${ref}`, "info");
				}

				return {
					render: (w: number) => container.render(w),
					invalidate: () => { container.invalidate(); rebuild(); },
					handleInput: (data: string) => {
						if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, config.stash)) {
							done(null);
						} else if (entries.length === 0) {
							return;
						} else if (matchesKey(data, Key.up) || data === "k") {
							if (selected > 0) { selected--; rebuild(); tui.requestRender(); }
						} else if (matchesKey(data, Key.down) || data === "j") {
							if (selected < entries.length - 1) { selected++; rebuild(); tui.requestRender(); }
						} else if (matchesKey(data, Key.enter)) {
							if (forceAction === "drop") { dropSelected(); return; }
							done({ index: selected, action: forceAction ?? config.enterAction });
						} else if (!forceAction && data === "a") {
							done({ index: selected, action: "apply" });
						} else if (!forceAction && data === "p") {
							done({ index: selected, action: "pop" });
						} else if (data === "d") {
							dropSelected();
						}
					},
				};
			},
		);

		if (!result) return;

		const entry = store.entries[result.index];
		const ref = `stash@{${result.index}}${entry.message ? `: ${entry.message}` : ""}`;

		if (result.action === "apply") {
			ctx.ui.setEditorText?.(entry.text);
			ctx.ui.notify(`Applied ${ref}`, "info");
		} else if (result.action === "pop") {
			ctx.ui.setEditorText?.(entry.text);
			store.entries.splice(result.index, 1);
			await saveStore(store);
			ctx.ui.notify(`Popped ${ref}`, "info");
		}
	}

	async function clearStashes(ctx: any) {
		const store = await loadStore();
		if (store.entries.length === 0) {
			ctx.ui.notify("Already clean — no stashes.", "info");
			return;
		}

		const ok = await ctx.ui.confirm(
			"Clear stash",
			`Drop all ${store.entries.length} stash(es)?`,
		);
		if (!ok) return;

		store.entries = [];
		await saveStore(store);
		ctx.ui.notify("All stashes cleared.", "info");
	}
}
