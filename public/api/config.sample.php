<?php
/**
 * Caulk - GitHub App Configuration
 *
 * Copy this file to `config.php` in the same directory:
 *   cp config.sample.php config.php
 *
 * Create a GitHub App so users choose which repos Caulk can access:
 *   1. On GitHub go to Settings -> Developer settings -> GitHub Apps -> New GitHub App.
 *   2. Homepage URL: https://<your-host>/
 *   3. Callback URL: https://<your-host>/
 *      Check "Request user authorization (OAuth) during installation".
 *   4. Setup URL: https://<your-host>/
 *      Check "Redirect on update".
 *   5. Webhook: uncheck "Active".
 *   6. Permissions -> Repository permissions:
 *        Contents: Read and write
 *        Metadata: Read-only
 *        Issues: Read and write
 *   7. Where can this GitHub App be installed: "Any account".
 *   8. Click "Create GitHub App", then fill in the values below.
 */

// 1. Your GitHub App's Client ID (shown on the app's General page)
define('GITHUB_CLIENT_ID', 'YOUR_GITHUB_CLIENT_ID_HERE');

// 2. Your GitHub App's Client Secret (General page -> "Generate a new client secret")
define('GITHUB_CLIENT_SECRET', 'YOUR_GITHUB_CLIENT_SECRET_HERE');

// 3. Your GitHub App's slug: the URL name in https://github.com/apps/<slug> (used for the install link)
define('GITHUB_APP_SLUG', 'your-app-slug');

// 4. Optional: Gemini API key. Browsers no longer receive the server key; users paste their own key in the app.
// Get a free key at: https://aistudio.google.com/apikey
define('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY_HERE');
