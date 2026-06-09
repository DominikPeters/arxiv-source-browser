#!/usr/bin/env php
<?php

declare(strict_types=1);

const DEFAULT_ENDPOINT = 'https://oaipmh.arxiv.org/oai';
const DEFAULT_PREFIX = 'arXiv';
const DEFAULT_DB_PATH = 'var/arxiv-metadata.sqlite';
const DEFAULT_USER_AGENT = 'arxiv-source-browser metadata mirror builder (contact: https://github.com/dominiksta/arxiv-source-browser)';

function usage(): void
{
    fwrite(STDERR, <<<TXT
Usage:
  php scripts/build-arxiv-metadata-db.php [options]

Options:
  --db=PATH              SQLite database path. Default: var/arxiv-metadata.sqlite
  --sleep=N              Minimum seconds between OAI-PMH request starts. Default: 3
  --metadata-prefix=NAME Metadata format. Default: arXiv
  --set=SETSPEC          Optional OAI setSpec, e.g. cs or cs:cs:AI
  --from=YYYY-MM-DD      Optional OAI from datestamp for incremental harvests
  --max-pages=N          Stop after N pages, useful for tests. Default: unlimited
  --endpoint=URL         OAI-PMH endpoint. Default: https://oaipmh.arxiv.org/oai
  --rebuild-fts          Rebuild the FTS table from papers and exit
  --help                 Show this message

The builder stores author/title/search-oriented metadata only. Abstracts are intentionally omitted.
It checkpoints the OAI resumption token after every page, so rerunning the same command resumes an interrupted harvest.

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

function ensureDirectory(string $path): void
{
    if (is_dir($path)) {
        return;
    }
    if (!mkdir($path, 0755, true) && !is_dir($path)) {
        throw new RuntimeException("Could not create directory: {$path}");
    }
}

function buildUrl(string $endpoint, array $params): string
{
    return $endpoint . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function fetchUrl(string $url): string
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('The PHP curl extension is required.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_USERAGENT => DEFAULT_USER_AGENT,
        CURLOPT_HTTPHEADER => ['Accept: application/xml,text/xml;q=0.9,*/*;q=0.1'],
    ]);

    $body = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    if ($body === false || $httpCode < 200 || $httpCode >= 300) {
        throw new RuntimeException("Fetch failed with HTTP {$httpCode}: {$error}");
    }

    return $body;
}

function xpathText(DOMXPath $xpath, DOMNode $context, string $query): ?string
{
    $nodes = $xpath->query($query, $context);
    if (!$nodes || $nodes->length === 0) {
        return null;
    }
    $value = trim($nodes->item(0)->textContent);
    return $value === '' ? null : preg_replace('/\s+/', ' ', $value);
}

function authorName(DOMXPath $xpath, DOMNode $author): ?string
{
    $forenames = xpathText($xpath, $author, './*[local-name()="forenames"]');
    $keyname = xpathText($xpath, $author, './*[local-name()="keyname"]');
    $suffix = xpathText($xpath, $author, './*[local-name()="suffix"]');

    $parts = array_values(array_filter([$forenames, $keyname, $suffix], fn($part) => $part !== null && $part !== ''));
    if ($parts !== []) {
        return implode(' ', $parts);
    }

    $fallback = trim($author->textContent);
    return $fallback === '' ? null : preg_replace('/\s+/', ' ', $fallback);
}

function parseCategories(?string $categories): array
{
    if ($categories === null) {
        return [];
    }
    return array_values(array_filter(preg_split('/\s+/', trim($categories)) ?: []));
}

function idFromOaiIdentifier(?string $identifier): ?string
{
    if ($identifier === null) {
        return null;
    }
    $prefix = 'oai:arXiv.org:';
    if (!str_starts_with($identifier, $prefix)) {
        return null;
    }
    $id = substr($identifier, strlen($prefix));
    return $id === '' ? null : $id;
}

function parseRecords(string $xml): array
{
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $dom->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT);
    $errors = libxml_get_errors();
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    if (!$loaded) {
        $firstError = $errors[0]->message ?? 'unknown XML parse error';
        throw new RuntimeException('Could not parse OAI response: ' . trim($firstError));
    }

    $xpath = new DOMXPath($dom);
    $oaiError = xpathText($xpath, $dom, '//*[local-name()="error"]');
    if ($oaiError !== null) {
        throw new RuntimeException("OAI-PMH error: {$oaiError}");
    }

    $records = [];
    $recordNodes = $xpath->query('//*[local-name()="ListRecords"]/*[local-name()="record"]');
    if (!$recordNodes) {
        return ['records' => [], 'resumptionToken' => null];
    }

    foreach ($recordNodes as $recordNode) {
        $status = null;
        $headerNodes = $xpath->query('./*[local-name()="header"]', $recordNode);
        $header = $headerNodes && $headerNodes->length > 0 ? $headerNodes->item(0) : null;
        if ($header instanceof DOMElement) {
            $status = $header->getAttribute('status') ?: null;
        }

        $oaiIdentifier = xpathText($xpath, $recordNode, './*[local-name()="header"]/*[local-name()="identifier"]');
        $arxivNode = null;
        $metadataNodes = $xpath->query('./*[local-name()="metadata"]/*', $recordNode);
        if ($metadataNodes && $metadataNodes->length > 0) {
            $arxivNode = $metadataNodes->item(0);
        }

        $authorNodes = $arxivNode ? $xpath->query('./*[local-name()="authors"]/*[local-name()="author"]', $arxivNode) : null;
        $authors = [];
        if ($authorNodes) {
            foreach ($authorNodes as $authorNode) {
                $name = authorName($xpath, $authorNode);
                if ($name !== null) {
                    $authors[] = $name;
                }
            }
        }

        $categories = $arxivNode ? parseCategories(xpathText($xpath, $arxivNode, './*[local-name()="categories"]')) : [];
        $metadataId = $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="id"]') : null;

        $records[] = [
            'oai_identifier' => $oaiIdentifier,
            'datestamp' => xpathText($xpath, $recordNode, './*[local-name()="header"]/*[local-name()="datestamp"]'),
            'deleted' => $status === 'deleted',
            'id' => $metadataId ?? idFromOaiIdentifier($oaiIdentifier),
            'created' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="created"]') : null,
            'updated' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="updated"]') : null,
            'title' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="title"]') : null,
            'authors' => $authors,
            'primary_category' => $categories[0] ?? null,
            'categories' => $categories,
            'doi' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="doi"]') : null,
            'journal_ref' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="journal-ref"]') : null,
            'license' => $arxivNode ? xpathText($xpath, $arxivNode, './*[local-name()="license"]') : null,
        ];
    }

    return [
        'records' => $records,
        'resumptionToken' => xpathText($xpath, $dom, '//*[local-name()="resumptionToken"]'),
    ];
}

function openDatabase(string $dbPath): SQLite3
{
    ensureDirectory(dirname($dbPath));
    $db = new SQLite3($dbPath);
    $db->busyTimeout(30000);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA synchronous = NORMAL');
    $db->exec('PRAGMA temp_store = MEMORY');
    $db->exec('PRAGMA cache_size = -200000');
    return $db;
}

function initializeSchema(SQLite3 $db): void
{
    $db->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  oai_identifier TEXT UNIQUE,
  datestamp TEXT,
  created TEXT,
  updated TEXT,
  title TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]',
  authors_text TEXT NOT NULL DEFAULT '',
  primary_category TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  categories_text TEXT NOT NULL DEFAULT '',
  doi TEXT,
  journal_ref TEXT,
  license TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
SQL);

    $db->exec('CREATE INDEX IF NOT EXISTS idx_papers_oai_identifier ON papers(oai_identifier)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_papers_datestamp ON papers(datestamp)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_papers_primary_category ON papers(primary_category)');

    $db->exec(<<<'SQL'
CREATE VIRTUAL TABLE IF NOT EXISTS paper_fts USING fts5(
  id UNINDEXED,
  title,
  authors,
  primary_category UNINDEXED,
  categories,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3 4'
);
SQL);

    $db->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS harvest_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
SQL);
}

function stateGet(SQLite3 $db, string $key): ?string
{
    $stmt = $db->prepare('SELECT value FROM harvest_state WHERE key = :key');
    $stmt->bindValue(':key', $key, SQLITE3_TEXT);
    $result = $stmt->execute();
    $row = $result ? $result->fetchArray(SQLITE3_ASSOC) : false;
    return $row ? (string) $row['value'] : null;
}

function stateSet(SQLite3 $db, string $key, ?string $value): void
{
    if ($value === null) {
        $stmt = $db->prepare('DELETE FROM harvest_state WHERE key = :key');
        $stmt->bindValue(':key', $key, SQLITE3_TEXT);
        $stmt->execute();
        return;
    }

    $stmt = $db->prepare('INSERT INTO harvest_state(key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    $stmt->bindValue(':key', $key, SQLITE3_TEXT);
    $stmt->bindValue(':value', $value, SQLITE3_TEXT);
    $stmt->execute();
}

function prepareStatements(SQLite3 $db): array
{
    return [
        'paperRowid' => $db->prepare('SELECT rowid FROM papers WHERE id = :id'),
        'upsertPaper' => $db->prepare(<<<'SQL'
INSERT INTO papers (
  id, oai_identifier, datestamp, created, updated, title,
  authors_json, authors_text, primary_category, categories_json, categories_text,
  doi, journal_ref, license, deleted
) VALUES (
  :id, :oai_identifier, :datestamp, :created, :updated, :title,
  :authors_json, :authors_text, :primary_category, :categories_json, :categories_text,
  :doi, :journal_ref, :license, :deleted
)
ON CONFLICT(id) DO UPDATE SET
  oai_identifier = excluded.oai_identifier,
  datestamp = excluded.datestamp,
  created = excluded.created,
  updated = excluded.updated,
  title = excluded.title,
  authors_json = excluded.authors_json,
  authors_text = excluded.authors_text,
  primary_category = excluded.primary_category,
  categories_json = excluded.categories_json,
  categories_text = excluded.categories_text,
  doi = excluded.doi,
  journal_ref = excluded.journal_ref,
  license = excluded.license,
  deleted = excluded.deleted
SQL),
        'markDeleted' => $db->prepare(<<<'SQL'
INSERT INTO papers (id, oai_identifier, datestamp, deleted)
VALUES (:id, :oai_identifier, :datestamp, 1)
ON CONFLICT(id) DO UPDATE SET
  oai_identifier = excluded.oai_identifier,
  datestamp = excluded.datestamp,
  deleted = 1
SQL),
        'deleteFts' => $db->prepare('DELETE FROM paper_fts WHERE rowid = :rowid'),
        'insertFts' => $db->prepare('INSERT INTO paper_fts(rowid, id, title, authors, primary_category, categories) VALUES (:rowid, :id, :title, :authors, :primary_category, :categories)'),
    ];
}

function bindNullable(SQLite3Stmt $stmt, string $name, ?string $value): void
{
    if ($value === null) {
        $stmt->bindValue($name, null, SQLITE3_NULL);
        return;
    }
    $stmt->bindValue($name, $value, SQLITE3_TEXT);
}

function paperRowid(array $statements, string $id): ?int
{
    $stmt = $statements['paperRowid'];
    $stmt->reset();
    $stmt->clear();
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    $result = $stmt->execute();
    $row = $result ? $result->fetchArray(SQLITE3_NUM) : false;
    return $row ? (int) $row[0] : null;
}

function deleteFtsRow(array $statements, int $rowid): void
{
    $deleteFts = $statements['deleteFts'];
    $deleteFts->reset();
    $deleteFts->clear();
    $deleteFts->bindValue(':rowid', $rowid, SQLITE3_INTEGER);
    $deleteFts->execute();
}

function upsertRecord(array $statements, array $record): bool
{
    $id = $record['id'] ?? null;
    if ($id === null || $id === '') {
        return false;
    }

    if ($record['deleted']) {
        $stmt = $statements['markDeleted'];
        $stmt->reset();
        $stmt->clear();
        $stmt->bindValue(':id', $id, SQLITE3_TEXT);
        bindNullable($stmt, ':oai_identifier', $record['oai_identifier']);
        bindNullable($stmt, ':datestamp', $record['datestamp']);
        $stmt->execute();

        $rowid = paperRowid($statements, $id);
        if ($rowid !== null) {
            deleteFtsRow($statements, $rowid);
        }
        return true;
    }

    $authors = $record['authors'];
    $categories = $record['categories'];
    $authorsText = implode(' ', $authors);
    $categoriesText = implode(' ', $categories);

    $stmt = $statements['upsertPaper'];
    $stmt->reset();
    $stmt->clear();
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    bindNullable($stmt, ':oai_identifier', $record['oai_identifier']);
    bindNullable($stmt, ':datestamp', $record['datestamp']);
    bindNullable($stmt, ':created', $record['created']);
    bindNullable($stmt, ':updated', $record['updated']);
    bindNullable($stmt, ':title', $record['title']);
    $stmt->bindValue(':authors_json', json_encode($authors, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), SQLITE3_TEXT);
    $stmt->bindValue(':authors_text', $authorsText, SQLITE3_TEXT);
    bindNullable($stmt, ':primary_category', $record['primary_category']);
    $stmt->bindValue(':categories_json', json_encode($categories, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), SQLITE3_TEXT);
    $stmt->bindValue(':categories_text', $categoriesText, SQLITE3_TEXT);
    bindNullable($stmt, ':doi', $record['doi']);
    bindNullable($stmt, ':journal_ref', $record['journal_ref']);
    bindNullable($stmt, ':license', $record['license']);
    $stmt->bindValue(':deleted', 0, SQLITE3_INTEGER);
    $stmt->execute();

    $rowid = paperRowid($statements, $id);
    if ($rowid === null) {
        throw new RuntimeException("Could not resolve SQLite rowid for {$id}");
    }
    deleteFtsRow($statements, $rowid);

    $fts = $statements['insertFts'];
    $fts->reset();
    $fts->clear();
    $fts->bindValue(':rowid', $rowid, SQLITE3_INTEGER);
    $fts->bindValue(':id', $id, SQLITE3_TEXT);
    bindNullable($fts, ':title', $record['title']);
    $fts->bindValue(':authors', $authorsText, SQLITE3_TEXT);
    bindNullable($fts, ':primary_category', $record['primary_category']);
    $fts->bindValue(':categories', $categoriesText, SQLITE3_TEXT);
    $fts->execute();

    return true;
}

function formatBytes(float $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $index = 0;
    while ($bytes >= 1024 && $index < count($units) - 1) {
        $bytes /= 1024;
        $index++;
    }
    return sprintf($index === 0 ? '%.0f %s' : '%.2f %s', $bytes, $units[$index]);
}

function countRows(SQLite3 $db, string $table): int
{
    $result = $db->querySingle("SELECT COUNT(*) FROM {$table}");
    return (int) $result;
}

function rebuildFts(SQLite3 $db): void
{
    $db->exec('DROP TABLE IF EXISTS paper_fts');
    $db->exec(<<<'SQL'
CREATE VIRTUAL TABLE paper_fts USING fts5(
  id UNINDEXED,
  title,
  authors,
  primary_category UNINDEXED,
  categories,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3 4'
);
SQL);
    $db->exec(<<<'SQL'
INSERT INTO paper_fts(rowid, id, title, authors, primary_category, categories)
SELECT rowid, id, title, authors_text, primary_category, categories_text
FROM papers
WHERE deleted = 0
SQL);
}

$options = getopt('', [
    'db:',
    'sleep:',
    'metadata-prefix:',
    'set:',
    'from:',
    'max-pages:',
    'endpoint:',
    'rebuild-fts',
    'help',
]);

if (isset($options['help'])) {
    usage();
    exit(0);
}

$dbPath = optionValue($options, 'db', DEFAULT_DB_PATH);
$sleepSeconds = max(0, (int) optionValue($options, 'sleep', '3'));
$metadataPrefix = optionValue($options, 'metadata-prefix', DEFAULT_PREFIX);
$setSpec = optionValue($options, 'set');
$from = optionValue($options, 'from');
$maxPages = optionValue($options, 'max-pages');
$maxPages = $maxPages === null ? null : max(1, (int) $maxPages);
$endpoint = optionValue($options, 'endpoint', DEFAULT_ENDPOINT);

$db = openDatabase($dbPath);
initializeSchema($db);

if (isset($options['rebuild-fts'])) {
    $started = microtime(true);
    rebuildFts($db);
    $db->exec('PRAGMA optimize');
    $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    clearstatcache(true, $dbPath);
    echo json_encode([
        'db_path' => $dbPath,
        'db_size_human' => file_exists($dbPath) ? formatBytes(filesize($dbPath) ?: 0) : '0 B',
        'papers_rows' => countRows($db, 'papers'),
        'fts_rows' => countRows($db, 'paper_fts'),
        'elapsed_seconds' => round(microtime(true) - $started, 3),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
}

$statements = prepareStatements($db);

$resumptionToken = stateGet($db, 'resumption_token');
$pageNumber = (int) (stateGet($db, 'pages_fetched') ?? '0');
$recordsStored = (int) (stateGet($db, 'records_seen') ?? '0');
$rawBytes = (int) (stateGet($db, 'raw_xml_bytes') ?? '0');

stateSet($db, 'endpoint', $endpoint);
stateSet($db, 'metadata_prefix', $metadataPrefix);
stateSet($db, 'set', $setSpec);
stateSet($db, 'from', $from);
stateSet($db, 'last_started_at', gmdate('c'));
stateSet($db, 'last_error', null);

try {
    $pagesThisRun = 0;
    $lastRequestStartedAt = null;
    while ($maxPages === null || $pagesThisRun < $maxPages) {
        if ($lastRequestStartedAt !== null && $sleepSeconds > 0) {
            $elapsedSinceLastRequest = microtime(true) - $lastRequestStartedAt;
            if ($elapsedSinceLastRequest < $sleepSeconds) {
                usleep((int) (($sleepSeconds - $elapsedSinceLastRequest) * 1_000_000));
            }
        }

        if ($resumptionToken !== null && $resumptionToken !== '') {
            $url = buildUrl($endpoint, [
                'verb' => 'ListRecords',
                'resumptionToken' => $resumptionToken,
            ]);
        } else {
            $params = [
                'verb' => 'ListRecords',
                'metadataPrefix' => $metadataPrefix,
            ];
            if ($setSpec !== null && $setSpec !== '') {
                $params['set'] = $setSpec;
            }
            if ($from !== null && $from !== '') {
                $params['from'] = $from;
            }
            $url = buildUrl($endpoint, $params);
        }

        fwrite(STDERR, sprintf("Fetching page %d: %s\n", $pageNumber + 1, $url));
        $fetchStarted = microtime(true);
        $lastRequestStartedAt = $fetchStarted;
        $xml = fetchUrl($url);
        $fetchSeconds = microtime(true) - $fetchStarted;
        $parseStarted = microtime(true);
        $parsed = parseRecords($xml);
        $parseSeconds = microtime(true) - $parseStarted;

        $storedThisPage = 0;
        $writeStarted = microtime(true);
        $db->exec('BEGIN IMMEDIATE');
        try {
            foreach ($parsed['records'] as $record) {
                if (upsertRecord($statements, $record)) {
                    $storedThisPage++;
                }
            }

            $pageNumber++;
            $pagesThisRun++;
            $recordsStored += $storedThisPage;
            $rawBytes += strlen($xml);
            $resumptionToken = $parsed['resumptionToken'];

            stateSet($db, 'pages_fetched', (string) $pageNumber);
            stateSet($db, 'records_seen', (string) $recordsStored);
            stateSet($db, 'raw_xml_bytes', (string) $rawBytes);
            stateSet($db, 'resumption_token', $resumptionToken);
            stateSet($db, 'last_page_finished_at', gmdate('c'));
            $db->exec('COMMIT');
        } catch (Throwable $e) {
            $db->exec('ROLLBACK');
            throw $e;
        }
        $writeSeconds = microtime(true) - $writeStarted;

        fwrite(STDERR, sprintf(
            "  stored %d records, %s raw XML, total stored-seen %d (fetch %.2fs, parse %.2fs, write %.2fs)\n",
            $storedThisPage,
            formatBytes(strlen($xml)),
            $recordsStored,
            $fetchSeconds,
            $parseSeconds,
            $writeSeconds
        ));

        if ($resumptionToken === null || $resumptionToken === '') {
            stateSet($db, 'resumption_token', null);
            stateSet($db, 'initial_harvest_completed_at', gmdate('c'));
            break;
        }
    }

    $db->exec('PRAGMA optimize');
    $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    clearstatcache(true, $dbPath);
    $summary = [
        'db_path' => $dbPath,
        'db_size_human' => file_exists($dbPath) ? formatBytes(filesize($dbPath) ?: 0) : '0 B',
        'pages_fetched' => $pageNumber,
        'records_seen' => $recordsStored,
        'papers_rows' => countRows($db, 'papers'),
        'fts_rows' => countRows($db, 'paper_fts'),
        'raw_xml_human' => formatBytes($rawBytes),
        'has_resumption_token' => stateGet($db, 'resumption_token') !== null,
        'completed' => stateGet($db, 'resumption_token') === null,
    ];

    echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
} catch (Throwable $e) {
    stateSet($db, 'last_error', $e->getMessage());
    fwrite(STDERR, "ERROR: {$e->getMessage()}\n");
    exit(1);
}
