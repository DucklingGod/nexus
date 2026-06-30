import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="mb-2 mt-4 text-xl font-bold text-nexus-fg">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1.5 mt-3 text-lg font-semibold text-nexus-fg">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-2 text-base font-semibold text-nexus-fg/90">{children}</h3>
        ),
        // Bold
        strong: ({ children }) => (
          <strong className="font-semibold text-nexus-fg">{children}</strong>
        ),
        // Italic
        em: ({ children }) => (
          <em className="italic text-nexus-fg/80">{children}</em>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 leading-relaxed">{children}</p>
        ),
        // Unordered lists
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>
        ),
        // Ordered lists
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>
        ),
        // List items
        li: ({ children }) => (
          <li className="text-sm leading-relaxed text-nexus-fg/90">{children}</li>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-nexus-gold/40 pl-3 italic text-nexus-fg/70">
            {children}
          </blockquote>
        ),
        // Inline code
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block rounded-lg bg-nexus-surface/80 p-3 text-xs font-mono text-nexus-fg/80 overflow-x-auto">
                {children}
              </code>
            );
          }
          return (
            <code className="rounded bg-nexus-surface/60 px-1.5 py-0.5 text-xs font-mono text-nexus-gold/90">
              {children}
            </code>
          );
        },
        // Horizontal rule
        hr: () => <hr className="my-3 border-nexus-border/30" />,
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-nexus-gold/80 underline decoration-nexus-gold/30 hover:text-nexus-gold"
          >
            {children}
          </a>
        ),
        // Tables (GFM)
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-nexus-border/30">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-nexus-border/10">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 text-left text-xs font-semibold text-nexus-fg/80">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5 text-xs text-nexus-fg/70">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
