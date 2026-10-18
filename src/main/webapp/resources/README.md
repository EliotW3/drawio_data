# UI resources

`dia.txt` holds every UI string of the application as `key=value` lines
(English). Strings are looked up with `mxResources.get('key', [params])`,
where `{1}`, `{2}`, ... are placeholders.

This fork is English only (see `docs/CHANGES.md`, CHG-002): there are no
translation files and the UI language cannot be changed. When you add a UI
string, add it to `dia.txt`.
