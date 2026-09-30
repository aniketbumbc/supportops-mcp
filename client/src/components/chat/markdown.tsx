import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders the assistant's markdown (lists, bold, tables). react-markdown never
 * renders raw HTML, so model output can't inject scripts or markup.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed [&_a]:text-ledger [&_a]:underline [&_code]:rounded [&_code]:bg-ink/5 [&_code]:px-1 [&_code]:text-[13px] [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-rule [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}