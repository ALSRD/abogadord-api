import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary: "bg-white text-slate-950 hover:bg-slate-200",
  ghost: "border border-white/10 bg-white/5 text-white hover:bg-white/10",
  subtle: "bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: keyof typeof variants;
};

export function Button({ children, className = "", variant = "ghost", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
