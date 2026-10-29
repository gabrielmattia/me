import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * O elemento com `role="slider"` é o *thumb*, não a raiz — então `aria-label` /
 * `aria-labelledby` são desviados para ele. Deixá-los na raiz (um `span` sem
 * papel) não nomeia nada para o leitor de tela.
 *
 * Com mais de um thumb todos herdam o mesmo nome; nesse caso passe
 * `aria-label` por thumb usando o primitivo direto.
 */
function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledBy,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const values = value ?? defaultValue ?? [min, max];

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className={cn(
					"bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
				)}
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className={cn(
						"bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
					)}
				/>
			</SliderPrimitive.Track>
			{values.map((_, index) => (
				<SliderPrimitive.Thumb
					// biome-ignore lint/suspicious/noArrayIndexKey: a posição É a identidade do thumb
					key={index}
					data-slot="slider-thumb"
					aria-label={ariaLabel}
					aria-labelledby={ariaLabelledBy}
					className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
