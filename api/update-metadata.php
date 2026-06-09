<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function jsonResponse(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
    exit;
}

function firstReadablePath(array $paths): ?string
{
    foreach ($paths as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }
    return null;
}

function readSecret(): ?string
{
    $envSecret = getenv('ARXIV_METADATA_CRON_TOKEN');
    if (is_string($envSecret) && trim($envSecret) !== '') {
        return trim($envSecret);
    }

    $secretPath = firstReadablePath([
        __DIR__ . '/../data/arxiv-metadata-cron-token.txt',
        __DIR__ . '/../var/arxiv-metadata-cron-token.txt',
    ]);
    if ($secretPath === null) {
        return null;
    }

    $secret = file_get_contents($secretPath);
    return is_string($secret) && trim($secret) !== '' ? trim($secret) : null;
}

function isAuthorized(string $expectedSecret): bool
{
    $queryToken = $_GET['token'] ?? '';
    if (is_string($queryToken) && $queryToken !== '' && hash_equals($expectedSecret, $queryToken)) {
        return true;
    }

    $basicPassword = $_SERVER['PHP_AUTH_PW'] ?? '';
    return is_string($basicPassword) && $basicPassword !== '' && hash_equals($expectedSecret, $basicPassword);
}

function metadataDbPath(): string
{
    $configured = getenv('ARXIV_METADATA_DB');
    if (is_string($configured) && $configured !== '') {
        return $configured;
    }

    return __DIR__ . '/../data/arxiv-metadata.sqlite';
}

function phpBinary(): string
{
    $configured = getenv('ARXIV_METADATA_PHP');
    if (is_string($configured) && $configured !== '') {
        return $configured;
    }

    return is_executable('/usr/bin/php') ? '/usr/bin/php' : PHP_BINARY;
}

function ensureDirectory(string $path): void
{
    if (is_dir($path)) {
        return;
    }
    if (!mkdir($path, 0755, true) && !is_dir($path)) {
        throw new RuntimeException("Could not create directory: {$path}");
    }
}

function shellCommand(array $args): string
{
    return implode(' ', array_map('escapeshellarg', $args));
}

$secret = readSecret();
if ($secret === null) {
    jsonResponse(503, [
        'ok' => false,
        'error' => 'Metadata update token is not configured.',
        'expected_file' => 'data/arxiv-metadata-cron-token.txt',
    ]);
}

if (!isAuthorized($secret)) {
    header('WWW-Authenticate: Basic realm="arXiv metadata updater"');
    jsonResponse(401, [
        'ok' => false,
        'error' => 'Unauthorized',
    ]);
}

$dbPath = metadataDbPath();
$scriptPath = realpath(__DIR__ . '/../scripts/update-arxiv-metadata-db.php');
if ($scriptPath === false) {
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Update script was not found.',
    ]);
}

$logPath = dirname($dbPath) . '/arxiv-metadata-update.log';
$statusPath = dirname($dbPath) . '/arxiv-metadata-update-status.json';
$maxPages = getenv('ARXIV_METADATA_UPDATE_MAX_PAGES');
$sleep = getenv('ARXIV_METADATA_UPDATE_SLEEP') ?: '3';
$overlapDays = getenv('ARXIV_METADATA_UPDATE_OVERLAP_DAYS') ?: '2';

try {
    ensureDirectory(dirname($logPath));
} catch (Throwable $e) {
    jsonResponse(500, [
        'ok' => false,
        'error' => $e->getMessage(),
    ]);
}

$command = [
    phpBinary(),
    $scriptPath,
    '--db=' . $dbPath,
    '--sleep=' . $sleep,
    '--overlap-days=' . $overlapDays,
];
if (is_string($maxPages) && $maxPages !== '') {
    $command[] = '--max-pages=' . $maxPages;
}

if (isset($_GET['plan'])) {
    jsonResponse(200, [
        'ok' => true,
        'mode' => 'plan',
        'db_path' => $dbPath,
        'log_path' => $logPath,
        'status_path' => $statusPath,
        'command' => shellCommand($command),
    ]);
}

$status = [
    'started_at' => gmdate('c'),
    'db_path' => $dbPath,
    'log_path' => $logPath,
];
@file_put_contents($statusPath, json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);

$backgroundCommand = 'nohup ' . shellCommand($command)
    . ' >> ' . escapeshellarg($logPath)
    . ' 2>&1 < /dev/null & echo $!';

$output = [];
$exitCode = 0;
exec($backgroundCommand, $output, $exitCode);

if ($exitCode !== 0) {
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Could not start metadata update process.',
        'exit_code' => $exitCode,
    ]);
}

jsonResponse(202, [
    'ok' => true,
    'started' => true,
    'pid' => $output[0] ?? null,
    'log_path' => $logPath,
    'status_path' => $statusPath,
]);
