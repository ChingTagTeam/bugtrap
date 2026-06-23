import type { Monaco } from '@monaco-editor/react';

export const BRAND_THEME = 'sidecode-dark';

/** Defines a Monaco theme matched to the Sidecode VS Code dark editor:
 *  #1E1E1E surface, indigo accents, default-style syntax colors. */
export function defineBrandTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(BRAND_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd4d4d4', background: '1e1e1e' },
      { token: 'comment', foreground: '6e6e6e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' },
      { token: 'function', foreground: 'dcdcaa' },
      { token: 'delimiter', foreground: '9d9d9d' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorGutter.background': '#1e1e1e',
      'editorLineNumber.foreground': '#45454c',
      'editorLineNumber.activeForeground': '#5c8af0',
      'editorCursor.foreground': '#5c8af0',
      'editor.selectionBackground': '#5c8af033',
      'editor.inactiveSelectionBackground': '#5c8af020',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorIndentGuide.background1': '#ffffff10',
      'editorIndentGuide.activeBackground1': '#ffffff22',
      'scrollbarSlider.background': '#5c8af022',
      'scrollbarSlider.hoverBackground': '#5c8af040',
      'scrollbarSlider.activeBackground': '#5c8af060',
      'editorWidget.background': '#252526',
      'editorWidget.border': '#3c3c3c',
      'editorHoverWidget.background': '#252526',
      'editorHoverWidget.border': '#3c3c3c',
      'editorOverviewRuler.border': '#00000000',
    },
  });
}
