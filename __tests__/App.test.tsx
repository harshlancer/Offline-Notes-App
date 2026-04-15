import {describe, expect, it} from '@jest/globals';
import {
  escapeHtml,
  htmlToPlainText,
  plainTextToHtml,
  stripHtml,
} from '../src/utils/helpers';

describe('helpers', () => {
  it('strips rich-text markup for previews and sharing', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe(
      'Hello world',
    );
  });

  it('escapes plain titles before HTML export', () => {
    expect(escapeHtml('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;');
  });

  it('turns rich text into readable plain text for the editor', () => {
    expect(
      htmlToPlainText(
        '<p>Hello<br/>world</p><ul><li>First</li><li>Second</li></ul>',
      ),
    ).toBe('Hello\nworld\n\n- First\n- Second');
  });

  it('serializes plain text back into export-safe html', () => {
    expect(plainTextToHtml('Line one\nLine two\n\nNext block')).toBe(
      '<p>Line one<br/>Line two</p><p>Next block</p>',
    );
  });
});
