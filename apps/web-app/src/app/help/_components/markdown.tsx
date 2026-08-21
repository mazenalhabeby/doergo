'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

/**
 * Help-article Markdown renderer. Styled inline (the project has no typography
 * plugin). Internal /help links use next/link for client-side nav.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => <h1 className="mt-8 mb-3 text-2xl font-semibold text-slate-900" {...p} />,
        h2: (p) => <h2 className="mt-8 mb-2 text-lg font-semibold text-slate-900" {...p} />,
        h3: (p) => <h3 className="mt-6 mb-2 text-[15px] font-semibold text-slate-800" {...p} />,
        p: (p) => <p className="my-3 text-[15px] leading-relaxed text-slate-600" {...p} />,
        ul: (p) => <ul className="my-3 ml-5 list-disc space-y-1.5 text-[15px] text-slate-600 marker:text-slate-400" {...p} />,
        ol: (p) => <ol className="my-3 ml-5 list-decimal space-y-1.5 text-[15px] text-slate-600 marker:text-slate-400" {...p} />,
        li: (p) => <li className="leading-relaxed" {...p} />,
        strong: (p) => <strong className="font-semibold text-slate-800" {...p} />,
        blockquote: (p) => (
          <blockquote className="my-4 rounded-r-lg border-l-4 border-blue-300 bg-blue-50/60 px-4 py-2.5 text-[14px] text-slate-600 [&_p]:my-0" {...p} />
        ),
        code: (p) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800" {...p} />,
        // `node` is react-markdown's own AST handle — it is not a DOM prop and
        // must not be spread onto an element.
        a: ({ href, node: _node, ...rest }) => {
          const internal = href?.startsWith('/');
          // `internal` already proved href is a string starting with "/".
          return internal && href ? (
            <Link href={href} className="font-medium text-blue-600 underline-offset-2 hover:underline" {...rest} />
          ) : (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline-offset-2 hover:underline" {...rest} />
          );
        },
        table: (p) => <table className="my-4 w-full border-collapse text-[14px]" {...p} />,
        th: (p) => <th className="border-b border-slate-200 py-2 pr-4 text-left font-semibold text-slate-700" {...p} />,
        td: (p) => <td className="border-b border-slate-100 py-2 pr-4 text-slate-600" {...p} />,
        hr: () => <hr className="my-6 border-slate-100" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
