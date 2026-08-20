---
order: 131
---

Edit by HASH anchors, never by line content. Copy the bare 3-character HASH from a read or diff row. A single-line change uses the same HASH in both fields. replacement_text must be byte-exact for the whole range. Preserve leading whitespace exactly. After an edit, the diff rows carry fresh anchors. Use batch_edit for several edits to one file. Undo a bad edit immediately with undo_last_edit.
