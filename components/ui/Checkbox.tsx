"use client";

import { forwardRef, InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
	props,
	ref
) {
	return <input ref={ref} type="checkbox" {...props} />;
});


