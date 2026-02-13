import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Keep backward-compatible alias for components still importing classNames
export function classNames(...inputs: ClassValue[]) {
  return cn(...inputs);
}
