const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Only http(s) and same-origin paths. "//host" and "/\host" are protocol-relative in browsers, so both are excluded.
const SAFE_URL = /^(https?:\/\/|\/(?![/\\]))/i;

const LINK_CLASS = 'text-teal-400 underline hover:text-teal-300 transition-colors';

/** Turns **bold**, [text](url) and newlines into HTML. Escapes everything else, so the result is safe for innerHTML. */
export function renderMarkdown(text: string): string {
  return text
    .replace(/[&<>"']/g, (c) => ESCAPES[c])
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, (match, label: string, url: string) => {
      if (!SAFE_URL.test(url)) return match;
      const external = url.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${external} class="${LINK_CLASS}">${label}</a>`;
    })
    .replace(/\n/g, '<br/>');
}
