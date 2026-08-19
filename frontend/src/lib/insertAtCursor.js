// Inserts `insertText` at a textarea's current cursor position (or replaces
// its selection), rather than always appending to the end — appending would
// jump an emoji away from wherever someone was actually typing mid-sentence.
export const insertAtCursor = (el, value, insertText) => {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return {
    next: value.slice(0, start) + insertText + value.slice(end),
    cursor: start + insertText.length,
  };
};
