import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../utils/renderMarkdown';

// Mirrors how Chatbot renders messages (dangerouslySetInnerHTML).
const render = (text: string) => {
  const el = document.createElement('span');
  el.innerHTML = renderMarkdown(text);
  return el;
};

describe('Chatbot renderMarkdown', () => {
  it('renders injected HTML as inert text', () => {
    const el = render('hi <img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toBe('hi <img src=x onerror="alert(1)"><script>alert(2)</script>');
  });

  it('does not create links for javascript:, data: or protocol-relative URLs', () => {
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', '//evil.com', '/\\evil.com', ' javascript:alert(1)']) {
      const el = render(`[x](${url})`);
      expect(el.querySelector('a')).toBeNull();
      expect(el.textContent).toBe(`[x](${url})`);
    }
  });

  it('cannot break out of the href attribute', () => {
    const a = render('[x](https://a.com/"onmouseover="alert)').querySelector('a')!;
    expect(a.getAttribute('onmouseover')).toBeNull();
    expect(a.getAttribute('href')).toBe('https://a.com/"onmouseover="alert');
  });

  it('still renders bold, newlines and links', () => {
    const el = render('**Hi** there\n[login](/login) or [site](https://example.com/?a=1&b=2)');
    expect(el.querySelector('strong')!.textContent).toBe('Hi');
    expect(el.querySelectorAll('br')).toHaveLength(1);

    const [internal, external] = el.querySelectorAll('a');
    expect(internal.getAttribute('href')).toBe('/login');
    expect(internal.hasAttribute('target')).toBe(false);
    expect(external.getAttribute('href')).toBe('https://example.com/?a=1&b=2');
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
