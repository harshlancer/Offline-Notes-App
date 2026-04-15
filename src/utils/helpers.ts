export const generateId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const formatRelativeTime = (value: number | Date): string => {
  const timestamp = value instanceof Date ? value.getTime() : value;
  const diff = Date.now() - timestamp;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);

  if (m < 1) {
    return 'Just now';
  }
  if (h < 1) {
    return `${m}m ago`;
  }
  if (d < 1) {
    return `${h}h ago`;
  }
  if (d < 7) {
    return `${d}d ago`;
  }

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export const getGreeting = (): string => {
  const h = new Date().getHours();

  if (h < 12) {
    return 'Good morning';
  }
  if (h < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

export const htmlToPlainText = (html: unknown): string => {
  if (!html) {
    return '';
  }
  if (typeof html !== 'string') {
    return String(html);
  }

  const withLineBreaks = html
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|blockquote|h[1-6])>/gi, '\n')
    .replace(/<(ul|ol)>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]*>/g, '');

  return decodeHtmlEntities(withLineBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const stripHtml = (html: unknown): string =>
  htmlToPlainText(html).replace(/\s+/g, ' ').trim();

export const plainTextToHtml = (value: string): string => {
  const normalized = value.replace(/\r\n?/g, '\n').trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
};
