import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, FileCode2 } from "lucide-react";

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "code";
  const code = String(children ?? "").replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-code-line bg-code-bg">
      <div className="flex items-center justify-between border-b border-code-line bg-code-head px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-code-muted">
          <FileCode2 className="size-3" />
          {lang}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-code-muted transition-colors hover:bg-white/10 hover:text-code"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-accent" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="code-chrome overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono text-code">{highlight(code)}</code>
      </pre>
    </div>
  );
}

// Minimal token colorizer — just enough to look polished without a heavy dep.
function highlight(code: string): React.ReactNode[] {
  const pattern =
    /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|import|from|export|default|type|interface|extends|implements|new|class|async|await|def|lambda|public|private|void|null|undefined|true|false|this)\b|\b(\d+\.?\d*)\b/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [full, comment, str, kw, num] = m;
    if (comment) out.push(<span key={key++} className="italic text-tok-com">{full}</span>);
    else if (str) out.push(<span key={key++} className="text-tok-str">{full}</span>);
    else if (kw) out.push(<span key={key++} className="text-tok-kw">{full}</span>);
    else if (num) out.push(<span key={key++} className="text-tok-num">{full}</span>);
    last = m.index + full.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export const Markdown = memo(function Markdown({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className={streaming ? "md-stream" : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-6 text-xl font-semibold tracking-tight text-primary first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-6 text-lg font-semibold tracking-tight text-primary first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2.5 mt-6 text-[17px] font-semibold tracking-tight text-primary first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 mt-5 text-[15px] font-semibold text-primary first:mt-0">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-3.5 text-[15px] leading-7 text-secondary last:mb-0">{children}</p>
          ),
          strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-secondary marker:text-muted">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-secondary marker:font-medium marker:text-muted">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-r-lg border-l-2 border-accent bg-accent-soft px-4 py-2.5 text-[15px] [&>p]:mb-0 [&>p]:text-secondary">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-border" />,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-md border border-strong">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-strong px-4 py-2.5 text-left text-[13px] font-semibold text-primary">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-4 py-2.5 align-top text-secondary [tr:last-child>&]:border-b-0">{children}</td>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
            return (
              <code
                className="rounded-sm border border-border bg-surface-2 px-1 py-px font-mono text-[13px] text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
