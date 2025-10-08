"use client";

import { forwardRef, SelectHTMLAttributes } from "react";
import { cx } from "./utils";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
	{ className, ...props },
	ref
) {
	const base = "border rounded px-2 py-1 text-sm bg-white";
	return <select ref={ref} className={cx(base, className)} {...props} />;
});


