import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "pdf-editor:theme";
type Theme = "light" | "dark";

/**
 * O site define os tokens `.dark` mas não aplica a classe em lugar nenhum.
 * O editor aplica `dark` no <html> enquanto está montado (o Radix renderiza
 * popovers/diálogos em portal, fora da árvore do editor) e restaura ao sair.
 */
export function useEditorTheme() {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		let initial: Theme = "light";
		try {
			const stored = localStorage.getItem(KEY);
			if (stored === "light" || stored === "dark") initial = stored;
			else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
				initial = "dark";
		} catch {
			/* storage bloqueado */
		}
		setTheme(initial);
	}, []);

	useEffect(() => {
		const root = document.documentElement;
		const had = root.classList.contains("dark");
		root.classList.toggle("dark", theme === "dark");
		root.style.colorScheme = theme;
		return () => {
			root.classList.toggle("dark", had);
			root.style.colorScheme = "";
		};
	}, [theme]);

	const toggle = useCallback(() => {
		setTheme((t) => {
			const next = t === "dark" ? "light" : "dark";
			try {
				localStorage.setItem(KEY, next);
			} catch {
				/* storage bloqueado */
			}
			return next;
		});
	}, []);

	return { theme, toggle };
}

export function ThemeToggle({
	theme,
	onToggle,
}: {
	theme: Theme;
	onToggle: () => void;
}) {
	const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
	return (
		<Button
			type="button"
			size="icon-sm"
			variant="ghost"
			onClick={onToggle}
			aria-label={label}
			title={label}
		>
			{theme === "dark" ? <Sun /> : <Moon />}
		</Button>
	);
}
