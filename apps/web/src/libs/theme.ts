import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import Cookies from "js-cookie";
import z from "zod";

const themeSchema = z.union([z.literal("light"), z.literal("dark")]);

export type Theme = z.infer<typeof themeSchema>;

const storageKey = "theme";
const defaultTheme: Theme = "dark";

export const themeMap = {
	light: msg`Light`,
	dark: msg`Dark`,
} satisfies Record<Theme, MessageDescriptor>;

export function isTheme(theme: string): theme is Theme {
	return themeSchema.safeParse(theme).success;
}

// Inside ResumeIQ's iframe the builder always uses ResumeIQ's light palette (see `.rq-embed` in globals.css).
export const isEmbedded = typeof window !== "undefined" && window.self !== window.top;

export const getTheme = () => {
	if (isEmbedded) return "light";
	const theme = Cookies.get(storageKey);
	if (!theme || !isTheme(theme)) return defaultTheme;
	return theme;
};

export const setThemeCookie = (theme: Theme) => {
	Cookies.set(storageKey, theme);
};
