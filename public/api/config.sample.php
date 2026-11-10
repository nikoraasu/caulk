<?php
/**
 * Caulk - GitHub OAuth Configuration
 *
 * Copy this file to `config.php` in the same directory:
 *   cp config.sample.php config.php
 *
 * Fill in your GitHub OAuth App credentials from:
 *   GitHub -> Settings -> Developer Settings -> OAuth Apps -> New OAuth App
 */

// 1. Your GitHub OAuth App Client ID
define('GITHUB_CLIENT_ID', 'YOUR_GITHUB_CLIENT_ID_HERE');

// 2. Your GitHub OAuth App Client Secret
define('GITHUB_CLIENT_SECRET', 'YOUR_GITHUB_CLIENT_SECRET_HERE');

// 3. Optional: Shared Gemini API Key so anyone on your whiteboard can use AI (Gemini 3.8 Flash)
// Get a free key at: https://aistudio.google.com/apikey
define('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY_HERE');
