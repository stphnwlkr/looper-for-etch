# Releases and WordPress updates

1. Update the plugin header, `package.json`, `package-lock.json`, `readme.txt` stable tag, and changelog. Adjust minimum WordPress/PHP versions when needed.
2. Run `npm ci && npm test`, `php tests/updater-test.php`, PHP lint, and the WordPress integration checks. Review the runtime ZIP allowlist.
3. Commit to main and push a stable `vX.Y.Z` tag. The release workflow checks the tag's ancestry and verifies the version before publishing.
4. The workflow publishes `looper-for-etch.zip` and `looper-for-etch-update.json`. Do not substitute GitHub's automatic source archive for the installable ZIP.
5. On a test site, use Dashboard → Updates → Check again. Metadata is cached for one hour; an unavailable release is retried after five minutes. Confirm the version and use WordPress Update now.

Installed versions before 0.8.0 do not contain this updater and need one manual ZIP installation. Future stable releases appear in the normal WordPress interface. Automatic updates remain opt-in through WordPress; the plugin does not enable them itself.

This repository distributes through GitHub. Its custom Update URI intentionally differs from WordPress.org plugin-directory rules. A future directory release would need a different update distribution configuration.
