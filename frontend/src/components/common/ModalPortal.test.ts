import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, afterEach } from 'vitest';
import { ModalPortal } from './ModalPortal';

describe('ModalPortal', () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete (globalThis as any).document;
    }
  });

  it('renders safely to static markup without crashing in SSR/Node', () => {
    delete (globalThis as any).document;
    const html = renderToStaticMarkup(
      React.createElement(
        'div',
        { className: 'parent' },
        React.createElement(ModalPortal, null, React.createElement('span', null, 'Content'))
      )
    );
    expect(html).toBe('<div class="parent"></div>');
  });

  it('creates portal targeted to document.body when document is available', () => {
    const fakeBody = { nodeType: 1, tagName: 'BODY' } as unknown as HTMLElement;
    (globalThis as any).document = { body: fakeBody };

    const childNode = React.createElement('span', { id: 'modal-child' }, 'Modal Text');
    const result = ModalPortal({ children: childNode });

    expect(result).not.toBeNull();
    // In React, createPortal returns a portal object whose containerInfo is the target container
    expect((result as any)?.containerInfo).toBe(fakeBody);
    expect((result as any)?.children).toBe(childNode);
  });

  it('creates portal targeted to custom container when provided', () => {
    const fakeCustom = { nodeType: 1, id: 'custom-box' } as unknown as HTMLElement;
    (globalThis as any).document = { body: {} as HTMLElement };

    const childNode = React.createElement('div', null, 'Custom Target');
    const result = ModalPortal({ children: childNode, container: fakeCustom });

    expect(result).not.toBeNull();
    expect((result as any)?.containerInfo).toBe(fakeCustom);
    expect((result as any)?.children).toBe(childNode);
  });
});
