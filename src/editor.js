import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

function convertCompletedLine(editor) {
  const { selection, schema } = editor.state;
  const { $from } = selection;
  if (
    !selection.empty ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parentOffset !== $from.parent.content.size
  )
    return;

  const start = $from.start();
  const matches = [...$from.parent.textContent.matchAll(/\*\*([^*\n]+)\*\*/g)];
  if (matches.length) {
    const transaction = editor.state.tr;
    for (const match of matches.reverse()) {
      const from = start + match.index;
      const length = match[1].length;
      transaction.delete(from + length + 2, from + length + 4);
      transaction.delete(from, from + 2);
      transaction.addMark(from, from + length, schema.marks.bold.create());
    }
    transaction.setStoredMarks([]);
    editor.view.dispatch(transaction);
  }

  const current = editor.state.selection.$from;
  if (current.node(-1).type.name === 'listItem') return;
  const text = current.parent.textContent;
  const bullet = text.match(/^- /);
  const ordered = text.match(/^(\d+)\. /);
  if (!bullet && !ordered) return;
  const prefixLength = (bullet || ordered)[0].length;
  const chain = editor.chain().deleteRange({
    from: current.start(),
    to: current.start() + prefixLength,
  });
  if (bullet) chain.toggleBulletList().run();
  else
    chain
      .toggleOrderedList()
      .updateAttributes('orderedList', {
        start: Math.min(Number(ordered[1]), 2147483647),
      })
      .run();
}

export function createNoteEditor(element, content, onUpdate) {
  let editor;
  editor = new Editor({
    element,
    content,
    autofocus: 'end',
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        strike: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder: 'メモを書く…' }),
    ],
    editorProps: {
      attributes: {
        class: 'note-content',
        role: 'textbox',
        'aria-label': '付箋の本文',
        'aria-multiline': 'true',
        'data-testid': 'note-editor',
        spellcheck: 'false',
      },
      handleDOMEvents: {
        keydown(view, event) {
          return (
            event.key === 'Enter' &&
            (event.isComposing || view.composing || event.keyCode === 229)
          );
        },
      },
      handleKeyDown(view, event) {
        if (
          event.key !== 'Enter' ||
          event.isComposing ||
          view.composing ||
          event.keyCode === 229 ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return false;
        convertCompletedLine(editor);
        return false;
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain');
        if (text === undefined) return true;
        event.preventDefault();
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        if (lines.length === 1) {
          if (text) editor.commands.insertContent({ type: 'text', text });
        } else {
          editor.commands.insertContent(
            lines.map((line) => ({
              type: 'paragraph',
              ...(line ? { content: [{ type: 'text', text: line }] } : {}),
            })),
          );
        }
        return true;
      },
      handleDrop() {
        return true;
      },
    },
    onUpdate({ editor: updated }) {
      onUpdate({
        content: updated.getJSON(),
        text: updated.getText({ blockSeparator: '\n' }),
      });
    },
  });
  return editor;
}
