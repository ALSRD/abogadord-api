import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      className="markdown-pro text-[15px] leading-7 text-slate-200"
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ children, ...props }) => (
          <a className="text-cyan underline decoration-cyan/40 underline-offset-4" target="_blank" rel="noreferrer" {...props}>
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-cyan/60 bg-cyan/5 py-2 pl-4 text-slate-300">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => (
          <code className={className || "rounded-md bg-white/10 px-1.5 py-0.5 text-cyan"}>{children}</code>
        ),
        h1: ({ children }) => <h1 className="mb-3 mt-5 text-2xl font-semibold text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 text-xl font-semibold text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-white">{children}</h3>,
        li: ({ children }) => <li className="ml-5 list-disc pl-1">{children}</li>,
        ol: ({ children }) => <ol className="my-3 space-y-1">{children}</ol>,
        p: ({ children }) => <p className="my-2">{children}</p>,
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/90 p-4">{children}</pre>,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-left text-sm">{children}</table>
          </div>
        ),
        td: ({ children }) => <td className="border-t border-white/10 px-3 py-2 text-slate-300">{children}</td>,
        th: ({ children }) => <th className="bg-white/5 px-3 py-2 font-semibold text-white">{children}</th>,
        ul: ({ children }) => <ul className="my-3 space-y-1">{children}</ul>
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
