import { type ReactNode, useId } from "react";
import { fmtBRLLong, fmtBRLShort, pad2 } from "./data";

/** Tipografia — serifada editorial para títulos e números grandes. */
export const DISPLAY = "font-[Fraunces,ui-serif,Georgia,serif]";
export const LABEL =
	"text-[11px] font-semibold uppercase tracking-[0.16em] text-(--ms-muted)";
export const NUM = "tabular-nums";

export function Ball({
	n,
	size = "md",
	tone = "green",
}: {
	n: number;
	size?: "sm" | "md" | "lg";
	tone?: "green" | "gold" | "outline";
}) {
	const sizes = {
		sm: "size-8 text-sm",
		md: "size-10 text-base",
		lg: "size-12 text-lg sm:size-14 sm:text-xl",
	};
	const tones = {
		green:
			"bg-(--ms-green) text-(--ms-on-green) shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]",
		gold: "bg-(--ms-gold) text-(--ms-on-gold) shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]",
		outline: "border border-(--ms-line-strong) text-(--ms-ink)",
	};
	return (
		<span
			className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${NUM} ${sizes[size]} ${tones[tone]}`}
		>
			{pad2(n)}
		</span>
	);
}

export function Section({
	kicker,
	title,
	lead,
	children,
}: {
	kicker: string;
	title: string;
	lead?: ReactNode;
	children: ReactNode;
}) {
	const titleId = useId();
	return (
		<section
			aria-labelledby={titleId}
			className="border-t border-(--ms-line) py-14 sm:py-20"
		>
			<div className="mb-8 max-w-2xl sm:mb-10">
				<p className={`${LABEL} mb-3 text-(--ms-gold-text)`}>{kicker}</p>
				<h2
					id={titleId}
					className={`${DISPLAY} text-3xl leading-tight font-semibold text-balance sm:text-4xl`}
				>
					{title}
				</h2>
				{lead ? (
					<p className="mt-4 text-base leading-relaxed text-pretty text-(--ms-muted) sm:text-lg">
						{lead}
					</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

export function Card({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`min-w-0 rounded-2xl border border-(--ms-line) bg-(--ms-surface) p-5 sm:p-6 ${className}`}
		>
			{children}
		</div>
	);
}

export function CardTitle({
	children,
	sub,
}: {
	children: ReactNode;
	sub?: ReactNode;
}) {
	return (
		<div className="mb-4">
			<h3 className="text-base font-semibold">{children}</h3>
			{sub ? <p className="mt-1 text-sm text-(--ms-muted)">{sub}</p> : null}
		</div>
	);
}

export function Kpi({
	label,
	value,
	detail,
	accent,
}: {
	label: string;
	value: ReactNode;
	detail: ReactNode;
	accent?: ReactNode;
}) {
	return (
		<Card className="flex flex-col gap-3">
			<p className={LABEL}>{label}</p>
			<div className="flex items-center gap-3">
				{accent}
				<p
					className={`${DISPLAY} ${NUM} text-3xl leading-none font-semibold whitespace-nowrap lg:text-[1.7rem] xl:text-[2rem]`}
				>
					{value}
				</p>
			</div>
			<p className="text-sm leading-snug text-(--ms-muted)">{detail}</p>
		</Card>
	);
}

/** Valor curto na tela (R$ 324,9 mi) e por extenso para leitores de tela. */
export function Money({ value }: { value: number }) {
	return (
		<>
			<span aria-hidden="true">{fmtBRLShort(value)}</span>
			<span className="sr-only">{fmtBRLLong(value)}</span>
		</>
	);
}
