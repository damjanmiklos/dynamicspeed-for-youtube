import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hasInnerHTMLAssignment,
  patchReactDomInnerHTML,
} from '../../scripts/patch-react-innerhtml.mjs';

describe('patchReactDomInnerHTML', () => {
  it('rewrites React script-tag creation to createElement', () => {
    const source = `
      nextResource = ownerDocument.createElement("div");
      nextResource.innerHTML = "<script>\\x3c/script>";
      nextResource = nextResource.removeChild(
        nextResource.firstChild
      );
    `;
    const patched = patchReactDomInnerHTML(source);
    expect(patched).toContain('createElement("script")');
    expect(hasInnerHTMLAssignment(patched ?? '')).toBe(false);
  });

  it('rewrites dangerouslySetInnerHTML assignments without using innerHTML', () => {
    const source = `
      key = value.__html;
      if (null != key) {
        domElement.innerHTML = key;
      }
    `;
    const patched = patchReactDomInnerHTML(source);
    expect(patched).toContain('function __dsAssignHTML(');
    expect(patched).toContain('__dsAssignHTML(domElement, key);');
    expect(patched).toContain('DOMParser');
    expect(hasInnerHTMLAssignment(patched ?? '')).toBe(false);
  });

  it('rewrites the production react-dom client bundle', () => {
    const source = readFileSync(
      'node_modules/react-dom/cjs/react-dom-client.production.js',
      'utf8',
    );
    expect(hasInnerHTMLAssignment(source)).toBe(true);
    const patched = patchReactDomInnerHTML(source);
    expect(patched).toBeTruthy();
    expect(hasInnerHTMLAssignment(patched ?? '')).toBe(false);
    expect(patched).toContain('createElement("script")');
    expect(patched).toContain('function __dsAssignHTML(');
  });
});
