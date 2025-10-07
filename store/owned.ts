"use client";

import { create } from "zustand";

type OwnedState = {
	getOwned: (setNumber: string, key: string) => number;
	setOwned: (setNumber: string, key: string, qty: number) => void;
	clearAll: (setNumber: string) => void;
	markAllAsOwned: (setNumber: string, keys: string[], quantities: number[]) => void;
};

const STORAGE_PREFIX = "cobble_owned_";

function storageKey(setNumber: string) {
	return `${STORAGE_PREFIX}${setNumber}`;
}

function read(setNumber: string): Record<string, number> {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(storageKey(setNumber));
		return raw ? (JSON.parse(raw) as Record<string, number>) : {};
	} catch {
		return {};
	}
}

function write(setNumber: string, data: Record<string, number>) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(storageKey(setNumber), JSON.stringify(data));
	} catch {}
}

export const useOwnedStore = create<OwnedState>((set) => ({
	getOwned: (setNumber, key) => {
		const state = read(setNumber);
		return state[key] ?? 0;
	},
	setOwned: (setNumber, key, qty) => {
		const state = read(setNumber);
		state[key] = Math.max(0, Math.floor(qty || 0));
		write(setNumber, state);
		set({});
	},
	clearAll: (setNumber) => {
		write(setNumber, {});
		set({});
	},
	markAllAsOwned: (setNumber, keys, quantities) => {
		const data: Record<string, number> = {};
		for (let i = 0; i < keys.length; i++) data[keys[i]] = quantities[i] ?? 0;
		write(setNumber, data);
		set({});
	},
}));


