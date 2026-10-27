# Releases and WordPress updates

1. Update the plugin header, `package.json`, `package-lock.json`, `readme.txt` stable tag, and add a newest-first entry to `changelog.json` with `version`, `summary`, and categorized `changes` lists. Adjust minimum WordPress/PHP versions when needed.
2. Run `npm ci && npm test`, `php tests/updater-test.php`, PHP lint, and the WordPress integration checks. Review the runtime ZIP allowlist.
3. Commit to main and push a stable `vX.Y.Z` tag. The release workflow checks the tag's ancestry and verifies the version before publishing.
4. The workflow publishes `looper-for-etch.zip` `looper-for-etch-update.json`, and `changelog.json`. Release notes are generated from the matching JSON entry. Do not substitute GitHub's automatic source archive for the installable ZIP.
5. On a test site, use Dashboard → Updates → Check again. Metadata is cached for one hour; an unavailable release is retried after five minutes. Confirm the version and use WordPress Update now.

Installed versions before 0.8.0 do not contain this updater and need one manual ZIP installation. Future stable releases appear in the normal WordPress interface. Automatic updates remain opt-in through WordPress; the plugin does not enable them itself.

This repository distributes through GitHub. Its custom Update URI intentionally differs from WordPress.org plugin-directory rules. A future directory release would need a different update distribution configuration.

The product page can consume the released history at https://github.com/stphnwlkr/looper-for-etch/releases/latest/download/changelog.json. The repository source is https://raw.githubusercontent.com/stphnwlkr/looper-for-etch/main/changelog.json. A release is blocked if its version is missing, duplicated, out of order, or mismatched with the header, package files, or stable tag.
