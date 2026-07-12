'use client';

// ドキュメント本文の Markdown レンダラ。GFM（表）対応。
// 表示専用。スタイルは globals.css の .doc-text 配下で当てる。

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="doc-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
