# Padelaso for Apple Shortcuts

`Padelaso.plist` is the editable, credential-free source for
`../public/shortcuts/Padelaso.shortcut`, downloaded from the scorekeeper UI.
The signed file is named **Padelaso**. Its actions are the same as the
“padelaso prueba” v2 template validated on iPhone and Apple Watch on 2026-09-05.

Setup asks for the user's token once. Four URLs reference that one text action,
all targeting `https://app.padelaso.com`. The source and public download must
never contain a real token. Do not publish an iCloud link to a configured copy.

Points display `spoken` (score or error). Events check whether `error` has no
value: success proceeds/silently completes; failure displays `spoken`. This
works both with and without the API's newer `ok` field. Do not replace these
checks with numeric comparisons: an earlier generated comparison imported
without its numeric operand on iOS.

## Validate and sign on macOS

From this directory:

```sh
node validate-template.mjs
plutil -lint Padelaso.plist
shortcuts_tmp=$(mktemp -d)
plutil -convert binary1 -o "$shortcuts_tmp/Padelaso.shortcut" Padelaso.plist
shortcuts sign --mode anyone --input "$shortcuts_tmp/Padelaso.shortcut" --output ../public/shortcuts/Padelaso.shortcut
```

Signing uses Apple's service and uploads the credential-free template. Commit
the source and newly signed file together. Changing the filename of an old
signed file alone does not change its internal name or actions.

The validator uses macOS `plutil` and Node. It checks variable references,
control-flow nesting, token setup/privacy, numeric team fields, and six mocked
event success/failure flows. It does not contact Padelaso or execute Shortcuts.

After changing actions, import on iPhone using a test match; verify points,
events, an invalid-token error and Apple Watch behavior. For this distribution
only the template name changed after device validation.
