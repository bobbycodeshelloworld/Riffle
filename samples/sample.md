# MD+SQL Viewer sample

A quick tour of what the viewer renders. Open this file, then press `⌘E` to
see the same content as editable source.

## Formatting

**Bold**, *italic*, `inline code`, ~~strikethrough~~, and [a link](https://example.com).

> Blockquotes render with an accent bar.
> Multiple lines stay together.

## Tables

| Column | Type | Notes |
|---|---|---|
| id | bigint | primary key |
| email | citext | unique |
| created_at | timestamptz | defaults to now() |

## Task list

- [x] Ship the unified viewer
- [ ] Add a third filetype
- [ ] Bikeshed the name

## Code fences

SQL fences get real syntax highlighting:

```sql
CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Other languages render as plain code:

```js
const answer = 42;
```

### Generics survive

Types like `Record<string, unknown>` and Array<number> don't vanish into
phantom HTML.

## A long section

This paragraph exists so the table of contents has something to highlight
while you scroll. The outline on the right tracks your position and clicking
an entry jumps to it — in edit mode it jumps your cursor to the same line.
