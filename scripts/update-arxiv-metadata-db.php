#!/usr/bin/env php
<?php

declare(strict_types=1);

const DEFAULT_DB_PATH = 'var/arxiv-metadata.sqlite';
const DEFAULT_SLEEP_SECONDS = 3;
const DEFAULT_OVERLAP_DAYS = 2;

function usage(): void
{
    fwrite(STDERR, <<<TXT
Usage:
  php scripts/update-arxiv-metadata-db.php [options]

Options:
  --db=PATH              Live SQLite database path. Default: var/arxiv-metadata.sqlite
  --work-db=PATH         Working copy path. Default: <db>.updating
  --lock=PATH            Lock file path. Default: <db>.update.lock
  --builder=PATH         Metadata builder script path. Default: scripts/build-arxiv-metadata-db.php
  --php=PATH             PHP binary. Default: current PHP binary
  --overlap-days=N       Re-harvest this many days before max(datestamp). Default: 2
  --sleep=N              Minimum seconds between OAI requests. Default: 3
  --max-pages=N          Optional page limit, useful for staged cron runs.
  --metadata-prefix=NAME OAI metadata format. Default: arXiv
  --set=SETSPEC          Optional OAI setSpec, e.g. cs or cs:cs:AI
  --endpoint=URL         Optional OAI-PMH endpoint override.
  --dry-run              Print the update plan without copying or fetching.
  --help                 Show this message.

The script updates a working copy and atomically replaces the live DB after a
successful harvest. This keeps the live DB compatible with immutable read-only
SQLite connections used by the web API.

Cron example:
  /usr/bin/php /path/to/scripts/update-arxiv-metadata-db.php --db=/path/to/data/arxiv-metadata.sqlite >> /path/to/var/arxiv-metadata-update.log 2>&1

TXT);
}

function optionValue(array $options, string $name, ?string $default = null): ?string
{
    $value = $options[$name] ?? $default;
    if (is_array($value)) {
        return (string) end($value);
    }
    return $value === null ? null : (string) $value;
}

function boolOption(array $options, string $name): bool
{
    return array_key_exists($name, $options);
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

function absolutePath(string $path): string
{
    if ($path === '') {
        return $path;
    }
    if ($path[0] === '/') {
        return $path;
    }
    return getcwd() . DIRECTORY_SEPARATOR . $path;
}

function removeSqliteSidecars(string $path): void
{
    @unlink($path . '-wal');
    @unlink($path . '-shm');
}

function maxDatestamp(string $dbPath): ?string
{
    if (!extension_loaded('sqlite3')) {
        throw new RuntimeException('The PHP sqlite3 extension is required.');
    }

    $db = new SQLite3($dbPath, SQLITE3_OPEN_READONLY);
    $value = $db->querySingle("SELECT MAX(datestamp) FROM papers WHERE datestamp IS NOT NULL AND datestamp != ''");
    if (!is_string($value) || $value === '') {
        return null;
    }
    return $value;
}

function fromDateForUpdate(string $dbPath, int $overlapDays): string
{
    $maxDatestamp = maxDatestamp($dbPath);
    if ($maxDatestamp === null) {
        throw new RuntimeException('Could not determine max(datestamp) from the existing DB.');
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', substr($maxDatestamp, 0, 10), new DateTimeZone('UTC'));
    if (!$date) {
        throw new RuntimeException("Could not parse max(datestamp): {$maxDatestamp}");
    }

    return $date->sub(new DateInterval('P' . max(0, $overlapDays) . 'D'))->format('Y-m-d');
}

function shellCommand(array $args): string
{
    return implode(' ', array_map('escapeshellarg', $args));
}

function runCommand(array $args): int
{
    $command = shellCommand($args);
    fwrite(STDERR, "Running: {$command}\n");
    passthru($command, $exitCode);
    return (int) $exitCode;
}

function validateWorkDb(string $workDb): void
{
    if (!is_readable($workDb)) {
        throw new RuntimeException("Updated DB was not created: {$workDb}");
    }

    $walPath = $workDb . '-wal';
    if (file_exists($walPath) && filesize($walPath) > 0) {
        throw new RuntimeException("SQLite WAL still has data after update: {$walPath}");
    }

    $db = new SQLite3($workDb, SQLITE3_OPEN_READONLY);
    $papers = (int) $db->querySingle('SELECT COUNT(*) FROM papers');
    $fts = (int) $db->querySingle('SELECT COUNT(*) FROM paper_fts');
    if ($papers <= 0 || $fts <= 0) {
        throw new RuntimeException("Updated DB failed sanity check: papers={$papers}, fts={$fts}");
    }
}

$options = getopt('', [
    'db:',
    'work-db:',
    'lock:',
    'builder:',
    'php:',
    'overlap-days:',
    'sleep:',
    'max-pages:',
    'metadata-prefix:',
    'set:',
    'endpoint:',
    'dry-run',
    'help',
]);

if (isset($options['help'])) {
    usage();
    exit(0);
}

$repoRoot = dirname(__DIR__);
$dbPath = absolutePath(optionValue($options, 'db', DEFAULT_DB_PATH));
$workDbPath = absolutePath(optionValue($options, 'work-db', $dbPath . '.updating'));
$lockPath = absolutePath(optionValue($options, 'lock', $dbPath . '.update.lock'));
$builderPath = absolutePath(optionValue($options, 'builder', $repoRoot . '/scripts/build-arxiv-metadata-db.php'));
$phpBinary = optionValue($options, 'php', PHP_BINARY);
$overlapDays = max(0, (int) optionValue($options, 'overlap-days', (string) DEFAULT_OVERLAP_DAYS));
$sleepSeconds = max(0, (int) optionValue($options, 'sleep', (string) DEFAULT_SLEEP_SECONDS));
$maxPages = optionValue($options, 'max-pages');
$metadataPrefix = optionValue($options, 'metadata-prefix', 'arXiv');
$setSpec = optionValue($options, 'set');
$endpoint = optionValue($options, 'endpoint');
$dryRun = boolOption($options, 'dry-run');

try {
    if (!is_readable($dbPath)) {
        throw new RuntimeException("Live DB is not readable: {$dbPath}");
    }
    if (!is_readable($builderPath)) {
        throw new RuntimeException("Builder script is not readable: {$builderPath}");
    }

    ensureDirectory(dirname($workDbPath));
    ensureDirectory(dirname($lockPath));

    $lockHandle = fopen($lockPath, 'c');
    if (!$lockHandle) {
        throw new RuntimeException("Could not open lock file: {$lockPath}");
    }
    if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
        fwrite(STDERR, "Another metadata update is already running.\n");
        exit(0);
    }

    $from = fromDateForUpdate($dbPath, $overlapDays);
    $command = [
        $phpBinary,
        $builderPath,
        '--db=' . $workDbPath,
        '--from=' . $from,
        '--sleep=' . (string) $sleepSeconds,
        '--metadata-prefix=' . $metadataPrefix,
    ];
    if ($maxPages !== null && $maxPages !== '') {
        $command[] = '--max-pages=' . $maxPages;
    }
    if ($setSpec !== null && $setSpec !== '') {
        $command[] = '--set=' . $setSpec;
    }
    if ($endpoint !== null && $endpoint !== '') {
        $command[] = '--endpoint=' . $endpoint;
    }

    $plan = [
        'db_path' => $dbPath,
        'work_db_path' => $workDbPath,
        'lock_path' => $lockPath,
        'from' => $from,
        'overlap_days' => $overlapDays,
        'command' => shellCommand($command),
        'dry_run' => $dryRun,
    ];
    fwrite(STDERR, json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

    if ($dryRun) {
        exit(0);
    }

    removeSqliteSidecars($workDbPath);
    if (!copy($dbPath, $workDbPath)) {
        throw new RuntimeException("Could not copy live DB to working DB: {$workDbPath}");
    }

    $mode = fileperms($dbPath);
    if ($mode !== false) {
        @chmod($workDbPath, $mode & 0777);
    }

    $exitCode = runCommand($command);
    if ($exitCode !== 0) {
        throw new RuntimeException("Builder exited with status {$exitCode}");
    }

    validateWorkDb($workDbPath);
    removeSqliteSidecars($workDbPath);

    if (!rename($workDbPath, $dbPath)) {
        throw new RuntimeException("Could not atomically replace live DB: {$dbPath}");
    }
    removeSqliteSidecars($dbPath);

    fwrite(STDERR, "Metadata DB update completed and live DB was replaced.\n");
} catch (Throwable $e) {
    fwrite(STDERR, "ERROR: {$e->getMessage()}\n");
    exit(1);
}
