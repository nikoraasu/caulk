<?php
/**
 * Caulk - GitHub OAuth Exchange Gateway
 * Runs natively on Apache/LiteSpeed with standard PHP (cURL or stream context).
 */

// Enable error reporting for debugging
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

header('X-Content-Type-Options: nosniff');

try {
    // Safe config file resolution
    $configFile = __DIR__ . '/config.php';
    $altConfigFile = dirname(__DIR__) . '/config.php';
    $configLoaded = false;
    $configError = null;
    $loadedPath = '';

    if (file_exists($configFile)) {
        $loadedPath = $configFile;
        try {
            require_once $configFile;
            $configLoaded = true;
        } catch (Throwable $e) {
            $configError = 'Parse/Runtime error in ' . basename($configFile) . ': ' . $e->getMessage() . ' on line ' . $e->getLine();
        }
    } elseif (file_exists($altConfigFile)) {
        $loadedPath = $altConfigFile;
        try {
            require_once $altConfigFile;
            $configLoaded = true;
        } catch (Throwable $e) {
            $configError = 'Parse/Runtime error in root config.php: ' . $e->getMessage() . ' on line ' . $e->getLine();
        }
    }

    // Safe constant retrieval (avoids bareword issues in PHP 8+)
    function caulk_get_constant(string $name): string {
        if (defined($name)) {
            $val = constant($name);
            return is_string($val) ? trim($val) : (string)$val;
        }
        $env = getenv($name);
        return is_string($env) ? trim($env) : '';
    }

    $clientId = caulk_get_constant('GITHUB_CLIENT_ID');
    $clientSecret = caulk_get_constant('GITHUB_CLIENT_SECRET');
    $geminiKey = caulk_get_constant('GEMINI_API_KEY');

    $action = isset($_GET['action']) ? (string)$_GET['action'] : '';

    // Public app configuration (OAuth status & optional shared Gemini key)
    if ($action === 'config') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'oauth_configured' => !empty($clientId) && $clientId !== 'YOUR_GITHUB_CLIENT_ID_HERE',
            'has_gemini_key' => !empty($geminiKey) && $geminiKey !== 'YOUR_GEMINI_API_KEY_HERE',
            'gemini_api_key' => (!empty($geminiKey) && $geminiKey !== 'YOUR_GEMINI_API_KEY_HERE') ? $geminiKey : '',
            'config_loaded' => $configLoaded,
            'config_error' => $configError,
        ]);
        exit;
    }

    // Diagnostics endpoint (?action=debug)
    if ($action === 'debug') {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html><body style="font-family:monospace;background:#283125;color:#E6D6AC;padding:30px;line-height:1.6;max-width:800px;margin:20px auto;">';
        echo '<h2 style="color:#E2B038;">λ Caulk - OAuth Diagnostics</h2>';
        echo '<ul>';
        echo '<li><b>PHP Version:</b> ' . phpversion() . '</li>';
        echo '<li><b>Config file found:</b> ' . ($configLoaded ? 'YES (' . htmlspecialchars($loadedPath) . ')' : 'NO (Looked in api/config.php and config.php)') . '</li>';
        if ($configError) {
            echo '<li style="color:#ff6b6b;"><b>Config Load Error:</b> ' . htmlspecialchars($configError) . '</li>';
        }
        echo '<li><b>Client ID set:</b> ' . ($clientId && $clientId !== 'YOUR_GITHUB_CLIENT_ID_HERE' ? 'YES (Length: ' . strlen($clientId) . ', starts with: ' . substr($clientId, 0, 4) . '..., ends with: ...' . substr($clientId, -4) . ')' : 'NO / NOT SET') . '</li>';
        echo '<li><b>Client Secret set:</b> ' . ($clientSecret && $clientSecret !== 'YOUR_GITHUB_CLIENT_SECRET_HERE' ? 'YES (Length: ' . strlen($clientSecret) . ')' : 'NO / NOT SET') . '</li>';
        echo '<li><b>Shared Gemini Key:</b> ' . ($geminiKey && $geminiKey !== 'YOUR_GEMINI_API_KEY_HERE' ? 'YES (gemini-3.8-flash)' : 'NO (User-provided)') . '</li>';
        
        $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https' : 'http';
        $currentUrl = $protocol . '://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
        echo '<li><b>Detected Callback URL:</b> <code>' . htmlspecialchars($currentUrl) . '</code></li>';
        echo '</ul>';
        
        if ($clientId && $clientId !== 'YOUR_GITHUB_CLIENT_ID_HERE') {
            $testUrl = 'https://github.com/login/oauth/authorize?client_id=' . urlencode($clientId) . '&scope=repo,read:user';
            echo '<p><b>Test Link:</b> <a href="' . htmlspecialchars($testUrl) . '" style="color:#E2B038;font-weight:bold;">Click here to test GitHub Authorize directly &rarr;</a></p>';
        }
        echo '</body></html>';
        exit;
    }

    // If GitHub OAuth credentials are not configured, display setup page (avoid status 500 to prevent LiteSpeed body clearing)
    if (empty($clientId) || empty($clientSecret) || $clientId === 'YOUR_GITHUB_CLIENT_ID_HERE') {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#283125;color:#E6D6AC;padding:40px;line-height:1.6;max-width:700px;margin:40px auto;border:2px solid #5A6A50;">';
        echo '<h2 style="color:#E2B038;margin-top:0;">λ Caulk - GitHub OAuth Configuration Needed</h2>';
        if ($configError) {
            echo '<div style="background:#552222;border:1px solid #ff4444;padding:12px;margin-bottom:16px;color:#ffaaaa;"><b>Configuration Error:</b> ' . htmlspecialchars($configError) . '</div>';
        }
        echo '<p><code>api/config.php</code> has not been configured with your GitHub credentials.</p>';
        echo '<ol>';
        echo '<li>Go to GitHub: <b>Settings &rarr; Developer settings &rarr; OAuth Apps &rarr; New OAuth App</b>.</li>';
        $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https' : 'http';
        $callbackUrl = $protocol . '://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
        echo '<li>Set Authorization callback URL to: <code>' . htmlspecialchars($callbackUrl) . '</code></li>';
        echo '<li>Copy <code>api/config.sample.php</code> to <code>api/config.php</code> and fill in your Client ID &amp; Secret.</li>';
        echo '</ol>';
        echo '<p><a href="?action=debug" style="color:#E2B038;font-weight:bold;">&rarr; View Diagnostic Details (?action=debug)</a></p>';
        echo '</body></html>';
        exit;
    }

    // 1. Kick off OAuth login
    if ($action === 'login') {
        $state = '';
        try {
            $state = bin2hex(random_bytes(16));
        } catch (Throwable $e) {
            $state = md5(uniqid((string)mt_rand(), true));
        }

        if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
            @session_start();
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION['oauth_state'] = $state;
            if (isset($_GET['redirect'])) {
                $_SESSION['oauth_redirect'] = $_GET['redirect'];
            }
        }

        $isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        // Fallback cookie for CSRF state in environments with restrictive session storage
        @setcookie('caulk_oauth_state', $state, [
            'expires' => time() + 600,
            'path' => '/',
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        $params = http_build_query([
            'client_id' => $clientId,
            'scope' => 'repo,read:user',
            'state' => $state,
        ]);

        header('Location: https://github.com/login/oauth/authorize?' . $params);
        exit;
    }

    // 2. Handle GitHub OAuth Callback
    if (isset($_GET['code'])) {
        if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
            @session_start();
        }
        $code = (string)$_GET['code'];
        $state = isset($_GET['state']) ? (string)$_GET['state'] : '';
        $expectedState = '';
        if (!empty($_SESSION['oauth_state'])) {
            $expectedState = (string)$_SESSION['oauth_state'];
        } elseif (!empty($_COOKIE['caulk_oauth_state'])) {
            $expectedState = (string)$_COOKIE['caulk_oauth_state'];
        }

        // Verify CSRF state
        if (!empty($expectedState) && !empty($state) && !hash_equals($expectedState, $state)) {
            header('Location: ../#auth_error=' . urlencode('Invalid OAuth CSRF state.'));
            exit;
        }

        // Exchange code for access token via GitHub API
        $tokenUrl = 'https://github.com/login/oauth/access_token';
        $postData = http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'code' => $code,
        ]);

        $response = null;
        $curlError = '';

        if (function_exists('curl_init')) {
            $ch = curl_init($tokenUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Accept: application/json',
                'User-Agent: Caulk-Board-OAuth',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $response = curl_exec($ch);
            if ($response === false) {
                $curlError = curl_error($ch);
            }
            curl_close($ch);
        } else {
            $opts = [
                'http' => [
                    'method' => 'POST',
                    'header' => "Accept: application/json\r\n" .
                                "Content-Type: application/x-www-form-urlencoded\r\n" .
                                "User-Agent: Caulk-Board-OAuth\r\n",
                    'content' => $postData,
                    'timeout' => 15,
                ],
            ];
            $context = stream_context_create($opts);
            $response = @file_get_contents($tokenUrl, false, $context);
        }

        if (!$response) {
            $msg = 'Failed to connect to GitHub OAuth service.';
            if (!empty($curlError)) {
                $msg .= ' (' . $curlError . ')';
            }
            header('Location: ../#auth_error=' . urlencode($msg));
            exit;
        }

        $data = json_decode($response, true);
        if (!empty($data['access_token'])) {
            $token = $data['access_token'];
            header('Location: ../#access_token=' . urlencode($token));
            exit;
        }

        $errorMsg = !empty($data['error_description']) ? $data['error_description'] : 'GitHub OAuth failed.';
        header('Location: ../#auth_error=' . urlencode($errorMsg));
        exit;
    }

    // Default fallback
    header('Location: ../');
    exit;

} catch (Throwable $e) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><body style="font-family:monospace;background:#283125;color:#E6D6AC;padding:30px;line-height:1.6;">';
    echo '<h2 style="color:#ff6b6b;">λ Caulk Gateway - Unhandled Runtime Exception</h2>';
    echo '<p><b>Error:</b> ' . htmlspecialchars($e->getMessage()) . '</p>';
    echo '<p><b>File:</b> ' . htmlspecialchars($e->getFile()) . ' on line ' . $e->getLine() . '</p>';
    echo '<pre style="background:#1e251b;padding:15px;border:1px solid #5A6A50;">' . htmlspecialchars($e->getTraceAsString()) . '</pre>';
    echo '</body></html>';
    exit;
}
