/**
 * Prompt Stash — git-style stashing for your editor prompts.
 *
 * Shortcuts (configurable via ~/.pi/stash-config.json):
 *   Ctrl+Q             — quick stash (no message)
 *   Ctrl+Shift+Q       — stash with a message
 *
 * Commands:
 *   /stash             — list all stashes
 *   /stash list        — list all stashes
 *   /stash pop         — pick a stash, paste into editor, remove it
 *   /stash apply       — pick a stash, paste into editor, keep it
 *   /stash drop        — pick a stash and delete it
 *   /stash clear       — drop every stash
 *
 * Stashes persist in ~/.pi/stash.json across sessions.
 *
 * Config (~/.pi/stash-config.json):
 *   {
 *     "stash": "ctrl+q",
 *     "stashWithMessage": "ctrl+shift+q"
 *   }
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

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
}

// ── Paths & defaults ────────────────────────────────────────

const HOME = homedir();
const STASH_FILE = `${HOME}/.pi/stash.json`;
const CONFIG_FILE = `${HOME}/.pi/stash-config.json`;

const DEFAULT_CONFIG: StashConfig = {
	stash: "ctrl+q",
	stashWithMessage: "ctrl+shift+q",
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

function formatStashLabel(entry: StashEntry, index: number): string {
	const date = new Date(entry.timestamp);
	const ts = date.toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
	const preview = entry.text.replace(/\n/g, " ").slice(0, 60);
	const msg = entry.message ? `: ${entry.message}` : "";
	return `stash@{${index}}${msg} — ${ts} — ${preview}${entry.text.length > 60 ? "…" : ""}`;
}

// ── Extension ───────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const config = loadConfig();

	// ── Shortcuts ───────────────────────────────────────────
	pi.registerShortcut(config.stash, {
		description: "Stash current editor text",
		handler: async (ctx) => pushStash(ctx, false),
	});

	pi.registerShortcut(config.stashWithMessage, {
		description: "Stash current editor text with a message",
		handler: async (ctx) => pushStash(ctx, true),
	});

	// ── /stash command ──────────────────────────────────────
	pi.registerCommand("stash", {
		description: "List stashes. Sub-commands: pop, apply, drop, clear",
		getArgumentCompletions: (prefix: string) => {
			const subs = ["list", "pop", "apply", "drop", "clear"];
			const filtered = subs
				.filter((s) => s.startsWith(prefix))
				.map((s) => ({ value: s, label: s }));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (trimmed === "" || trimmed === "list") return listStashes(ctx);
			if (trimmed === "pop") return pickStash(ctx, true);
			if (trimmed === "apply") return pickStash(ctx, false);
			if (trimmed === "drop") return dropStash(ctx);
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
			if (input == null) return; // cancelled
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

	async function listStashes(ctx: any) {
		const store = await loadStore();
		if (store.entries.length === 0) {
			ctx.ui.notify("No stashes.", "info");
			return;
		}
		const lines = store.entries.map((e: StashEntry, i: number) =>
			formatStashLabel(e, i),
		);
		await ctx.ui.select("Stash list (Esc to close):", lines);
	}

	async function pickStash(ctx: any, remove: boolean) {
		const store = await loadStore();
		if (store.entries.length === 0) {
			ctx.ui.notify("No stashes to " + (remove ? "pop" : "apply") + ".", "info");
			return;
		}

		const labels = store.entries.map((e: StashEntry, i: number) =>
			formatStashLabel(e, i),
		);
		const picked = await ctx.ui.select(
			remove ? "Pop stash (select & remove):" : "Apply stash (select & keep):",
			labels,
		);
		if (picked == null) return;

		const index = labels.indexOf(picked);
		if (index === -1) return;

		const entry = store.entries[index];
		ctx.ui.setEditorText?.(entry.text);

		if (remove) {
			store.entries.splice(index, 1);
			await saveStore(store);
		}

		ctx.ui.notify(
			`${remove ? "Popped" : "Applied"} stash@{${index}}${entry.message ? `: ${entry.message}` : ""}`,
			"info",
		);
	}

	async function dropStash(ctx: any) {
		const store = await loadStore();
		if (store.entries.length === 0) {
			ctx.ui.notify("No stashes to drop.", "info");
			return;
		}

		const labels = store.entries.map((e: StashEntry, i: number) =>
			formatStashLabel(e, i),
		);
		const picked = await ctx.ui.select("Drop stash (select & delete):", labels);
		if (picked == null) return;

		const index = labels.indexOf(picked);
		if (index === -1) return;

		const entry = store.entries[index];
		store.entries.splice(index, 1);
		await saveStore(store);
		ctx.ui.notify(
			`Dropped stash@{${index}}${entry.message ? `: ${entry.message}` : ""}`,
			"info",
		);
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
