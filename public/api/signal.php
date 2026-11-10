<?php
/**
 * Slateboard live relay: an HTTP polling queue for end-to-end encrypted
 * collaboration messages. The server only stores opaque ciphertext and never
 * sees the passphrase or the derived key.
 *
 *   POST ?action=publish&room=R        body: {"from","kind","data","to"?}
 *   GET  ?action=poll&room=R&since=N[&wait=1]  -> {"messages":[...],"last":N}
 *        wait=1 holds the request up to 15s until a newer message exists.
 *
 * Rooms live in _relay/<room>.json. Messages expire after 60 seconds and each
 * room keeps at most the newest 300.
 */

const RELAY_ROOM_PATTERN = '/^[a-zA-Z0-9_-]{1,80}$/D';
const RELAY_MAX_BODY = 2097152; // 2 MB
const RELAY_TTL_SECONDS = 60;
const RELAY_MAX_MESSAGES = 300;

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function relay_respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function relay_error(int $status, string $message): void
{
    relay_respond($status, ['error' => $message]);
}

function relay_read_state($fp): array
{
    rewind($fp);
    $raw = stream_get_contents($fp);
    $data = (is_string($raw) && $raw !== '') ? json_decode($raw, true) : null;
    if (!is_array($data)) {
        $data = [];
    }
    $seq = (isset($data['seq']) && is_int($data['seq'])) ? $data['seq'] : 0;
    $messages = (isset($data['messages']) && is_array($data['messages']))
        ? array_values(array_filter($data['messages'], 'is_array'))
        : [];
    return ['seq' => $seq, 'messages' => $messages];
}

function relay_write_state($fp, array $state): bool
{
    $json = json_encode($state);
    if ($json === false) {
        return false;
    }
    if (!ftruncate($fp, 0)) {
        return false;
    }
    rewind($fp);
    $written = fwrite($fp, $json);
    fflush($fp);
    return $written === strlen($json);
}

function relay_publish(string $file): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: POST');
        relay_error(405, 'Method not allowed');
    }
    $declared = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
    if ($declared > RELAY_MAX_BODY) {
        relay_error(413, 'Body too large');
    }
    $raw = file_get_contents('php://input', false, null, 0, RELAY_MAX_BODY + 1);
    if ($raw === false) {
        relay_error(400, 'Unreadable body');
    }
    if (strlen($raw) > RELAY_MAX_BODY) {
        relay_error(413, 'Body too large');
    }

    $body = json_decode($raw, true);
    if (!is_array($body)
        || !is_string($body['from'] ?? null) || $body['from'] === '' || strlen($body['from']) > 64
        || !in_array($body['kind'] ?? null, ['update', 'awareness', 'hello'], true)
        || !is_string($body['data'] ?? null)
        || (isset($body['to']) && (!is_string($body['to']) || $body['to'] === '' || strlen($body['to']) > 64))
    ) {
        relay_error(400, 'Invalid message');
    }

    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        relay_error(500, 'Cannot open room');
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        relay_error(500, 'Cannot lock room');
    }

    $state = relay_read_state($fp);
    $now = time();
    $state['seq'] += 1;

    $message = [
        'seq' => $state['seq'],
        'ts' => $now,
        'from' => $body['from'],
        'kind' => $body['kind'],
        'data' => $body['data'],
    ];
    if (isset($body['to'])) {
        $message['to'] = $body['to'];
    }

    $cutoff = $now - RELAY_TTL_SECONDS;
    $messages = array_filter($state['messages'], function ($m) use ($cutoff) {
        return ($m['ts'] ?? 0) >= $cutoff;
    });
    $messages[] = $message;
    $state['messages'] = array_slice(array_values($messages), -RELAY_MAX_MESSAGES);

    $ok = relay_write_state($fp, $state);
    flock($fp, LOCK_UN);
    fclose($fp);

    if (!$ok) {
        relay_error(500, 'Cannot write room');
    }
    relay_respond(200, ['ok' => true, 'seq' => $state['seq']]);
}

function relay_poll(string $file): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        header('Allow: GET');
        relay_error(405, 'Method not allowed');
    }
    $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
    if ($since < 0) {
        $since = 0;
    }

    // wait=1: long poll, hold the request until something newer than `since` arrives.
    $wait = isset($_GET['wait']) && $_GET['wait'] === '1';
    if ($wait) {
        set_time_limit(25);
        ignore_user_abort(false);
    }
    $deadline = microtime(true) + 15;

    while (true) {
        $state = relay_poll_read($file);
        $messages = $state['messages'];
        if ($since <= $state['seq']) {
            $messages = array_values(array_filter($messages, function ($m) use ($since) {
                return ($m['seq'] ?? 0) > $since;
            }));
        }
        if (!$wait || count($messages) > 0 || microtime(true) >= $deadline || connection_aborted()) {
            relay_respond(200, ['messages' => $messages, 'last' => $state['seq']]);
        }
        usleep(40000);
        clearstatcache(true, $file);
    }
}

function relay_poll_read(string $file): array
{
    $fp = @fopen($file, 'rb');
    if ($fp === false) {
        return ['seq' => 0, 'messages' => []];
    }
    if (!flock($fp, LOCK_SH)) {
        fclose($fp);
        relay_error(500, 'Cannot lock room');
    }
    $state = relay_read_state($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $state;
}

$room = isset($_GET['room']) ? (string)$_GET['room'] : '';
if (!preg_match(RELAY_ROOM_PATTERN, $room)) {
    relay_error(400, 'Invalid room');
}

$dir = __DIR__ . '/_relay';
if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
    relay_error(500, 'Cannot create relay storage');
}
$guard = $dir . '/.htaccess';
if (!is_file($guard) && @file_put_contents($guard, "Require all denied\nDeny from all\n") === false) {
    relay_error(500, 'Cannot write relay storage guard');
}
$file = $dir . '/' . $room . '.json';

$action = isset($_GET['action']) ? (string)$_GET['action'] : '';
if ($action === 'publish') {
    relay_publish($file);
} elseif ($action === 'poll') {
    relay_poll($file);
} else {
    relay_error(400, 'Unknown action');
}
