import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-black/10 bg-white shadow-panel", className)} {...props} />;
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10"
      {...props}
    />
  );
}
