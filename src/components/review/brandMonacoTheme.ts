import type { Monaco } from '@monaco-editor/react';

export const BRAND_THEME = 'bugtrap-dark';

/** Defines a Monaco theme matched to the BugTrap brand surfaces + lime accents. */
export function defineBrandTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(BRAND_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'f2f2ef', background: '1d1d20' },
      { token: 'comment', foreground: '6f6f76', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a6f02e' },
      { token: 'string', foreground: '83c818' },
      { token: 'number', foreground: '54b8ff' },
      { token: 'type', foreground: '54b8ff' },
      { token: 'delimiter', foreground: 'a3a3a8' },
    ],
    colors: {
      'editor.background': '#1d1d20',
      'editor.foreground': '#f2f2ef',
      'editorGutter.background': '#1d1d20',
      'editorLineNumber.foreground': '#4a4a50',
      'editorLineNumber.activeForeground': '#83c818',
      'editorCursor.foreground': '#83c818',
      'editor.selectionBackground': '#83c81833',
      'editor.inactiveSelectionBackground': '#83c81820',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorIndentGuide.background1': '#ffffff10',
      'editorIndentGuide.activeBackground1': '#ffffff22',
      'scrollbarSlider.background': '#83c81822',
      'scrollbarSlider.hoverBackground': '#83c81840',
      'scrollbarSlider.activeBackground': '#83c81860',
      'editorWidget.background': '#252529',
      'editorWidget.border': '#ffffff14',
      'editorHoverWidget.background': '#252529',
      'editorHoverWidget.border': '#ffffff14',
      'editorOverviewRuler.border': '#00000000',
    },
  });
}
