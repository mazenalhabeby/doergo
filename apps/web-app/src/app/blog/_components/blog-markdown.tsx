import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

/**
 * Blog-article Markdown renderer in the dark marketing theme (the help center
 * has its own light-theme renderer). Server component — no client JS shipped.
 */
export function BlogMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: (p) => <h2 className="mt-12 mb-4 text-[24px] leading-snug tracking-[-0.01em] text-[#f2f2f0]" {...p} />,
        h3: (p) => <h3 className="mt-8 mb-3 text-[19px] leading-snug text-[#f2f2f0]" {...p} />,
        p: (p) => <p className="my-4 text-[16.5px] leading-[1.75] text-white/70" {...p} />,
        ul: (p) => <ul className="my-4 ml-5 list-disc space-y-2 text-[16.5px] leading-[1.75] text-white/70 marker:text-white/30" {...p} />,
        ol: (p) => <ol className="my-4 ml-5 list-decimal space-y-2 text-[16.5px] leading-[1.75] text-white/70 marker:text-white/30" {...p} />,
        li: (p) => <li className="pl-1" {...p} />,
        strong: (p) => <strong className="font-semibold text-[#f2f2f0]" {...p} />,
        blockquote: (p) => (
          <blockquote className="my-6 border-l-2 border-white/20 pl-5 text-white/60 [&_p]:my-0" {...p} />
        ),
        code: (p) => <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[14px] text-[#f2f2f0]" {...p} />,
        a: ({ href, ...rest }) => {
          const internal = href?.startsWith("/");
          return internal ? (
            <Link href={href!} className="text-[#f2f2f0] underline decoration-white/30 underline-offset-4 hover:decoration-white/70" {...(rest as React.ComponentProps<"a">)} />
          ) : (
            <a href={href} target="_blank" rel="noreferrer" className="text-[#f2f2f0] underline decoration-white/30 underline-offset-4 hover:decoration-white/70" {...rest} />
          );
        },
        table: (p) => (
          <div className="my-6 overflow-x-auto">
            <table className="w-full border-collapse text-[15px]" {...p} />
          </div>
        ),
        th: (p) => <th className="border-b border-white/[0.15] py-2 pr-4 text-left font-semibold text-[#f2f2f0]" {...p} />,
        td: (p) => <td className="border-b border-white/[0.08] py-2 pr-4 text-white/65" {...p} />,
        hr: () => <hr className="my-10 border-white/[0.08]" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
