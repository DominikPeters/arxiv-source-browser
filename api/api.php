<?php
/**
 * arXiv Source Downloader and Converter
 *
 * Supports:
 * - Legacy source download: ?url=<id-or-arxiv-url>
 * - Explicit source download: ?action=source&id=<versioned-id>
 * - Version metadata: ?action=versions&id=<id-or-arxiv-url>
 * - Lightweight metadata: ?action=meta&id=<id-or-arxiv-url>
 * - Metadata search: ?action=search&q=<query>
 */

// Error reporting disabled for production security
error_reporting(0);
ini_set('display_errors', 0);

// Set memory and time limits for handling large files
ini_set('memory_limit', '256M');
set_time_limit(120);

/**
 * Extract paper ID from arXiv URL or validate direct ID input
 */
function extractArxivId($input) {
    $input = trim((string) $input);
    if ($input === '') {
        return false;
    }

    // First check if input is already a valid arXiv ID
    $idPatterns = [
        '/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/',  // New format: 2402.10439 or 2402.10439v1
        '/^([a-z-]+\/[0-9]{7}(?:v[0-9]+)?)$/',     // Old format: math-ph/0501023 or math-ph/0501023v1
    ];

    foreach ($idPatterns as $pattern) {
        if (preg_match($pattern, $input, $matches)) {
            return $matches[1];
        }
    }

    // If not a direct ID, try to extract from URL
    $urlPatterns = [
        '/arxiv\.org\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/pdf\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/html\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        '/arxiv\.org\/src\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/',
        // Also handle old format IDs in URLs
        '/arxiv\.org\/(?:abs|pdf|html|src)\/([a-z-]+\/[0-9]{7}(?:v[0-9]+)?)/',
    ];

    foreach ($urlPatterns as $pattern) {
        if (preg_match($pattern, $input, $matches)) {
            return $matches[1];
        }
    }

    return false;
}

/**
 * Normalize ID into base/version tuple.
 */
function normalizeArxivId($input) {
    $id = extractArxivId($input);
    if (!$id) {
        return false;
    }

    if (preg_match('/^(.*)v([0-9]+)$/', $id, $matches)) {
        return [
            'id' => $id,
            'baseId' => $matches[1],
            'version' => (int) $matches[2],
        ];
    }

    return [
        'id' => $id,
        'baseId' => $id,
        'version' => null,
    ];
}

/**
 * Download text from URL with error handling.
 */
function fetchText($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; arxiv-source-browser.github.io)');

    $data = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || $data === false) {
        return false;
    }

    return $data;
}

/**
 * Locate the optional arXiv metadata mirror.
 */
function getMetadataDbPath() {
    $configured = getenv('ARXIV_METADATA_DB');
    if ($configured && is_readable($configured)) {
        return $configured;
    }

    $candidates = [
        __DIR__ . '/../data/arxiv-metadata.sqlite',
        __DIR__ . '/../var/arxiv-metadata.sqlite',
    ];

    foreach ($candidates as $candidate) {
        if (is_readable($candidate)) {
            return $candidate;
        }
    }

    return null;
}

/**
 * Build a SQLite URI filename for immutable read-only access.
 */
function buildSqliteImmutableUri($path) {
    $realPath = realpath($path);
    if ($realPath === false) {
        return null;
    }

    return 'file:' . str_replace('%2F', '/', rawurlencode($realPath)) . '?mode=ro&immutable=1';
}

/**
 * Open the metadata mirror read-only when available.
 */
function openMetadataDb() {
    $dbPath = getMetadataDbPath();
    if (!$dbPath) {
        return null;
    }

    $immutableUri = buildSqliteImmutableUri($dbPath);
    if ($immutableUri !== null && extension_loaded('pdo_sqlite')) {
        try {
            $db = new PDO('sqlite:' . $immutableUri, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 3,
            ]);
            $db->exec('PRAGMA query_only = ON');
            return $db;
        } catch (Exception $e) {
            // Fall back to SQLite3 below for PHP builds without URI filename support.
        }
    }

    if (extension_loaded('sqlite3')) {
        try {
            $db = new SQLite3($dbPath, SQLITE3_OPEN_READONLY);
            $db->busyTimeout(3000);
            return $db;
        } catch (Exception $e) {
            error_log('Could not open arXiv metadata database: ' . $e->getMessage());
            return null;
        }
    }

    return null;
}

/**
 * Decode a JSON array column defensively.
 */
function decodeJsonArray($value) {
    if (!is_string($value) || $value === '') {
        return [];
    }

    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Map a metadata database row to API shape.
 */
function mapPaperMetadataRow($row) {
    if (!$row) {
        return null;
    }

    return [
        'id' => $row['id'],
        'oaiIdentifier' => $row['oai_identifier'] ?? null,
        'datestamp' => $row['datestamp'] ?? null,
        'created' => $row['created'] ?? null,
        'updated' => $row['updated'] ?? null,
        'title' => $row['title'] ?? null,
        'authors' => decodeJsonArray($row['authors_json'] ?? null),
        'primaryCategory' => $row['primary_category'] ?? null,
        'categories' => decodeJsonArray($row['categories_json'] ?? null),
        'doi' => $row['doi'] ?? null,
        'journalRef' => $row['journal_ref'] ?? null,
        'license' => $row['license'] ?? null,
    ];
}

/**
 * Look up paper metadata in the local mirror.
 */
function lookupPaperMetadata($id) {
    $db = openMetadataDb();
    if (!$db) {
        return null;
    }

    $normalized = normalizeArxivId($id);
    $baseId = $normalized ? $normalized['baseId'] : $id;

    if ($db instanceof PDO) {
        $stmt = $db->prepare('SELECT * FROM papers WHERE id = :id AND deleted = 0 LIMIT 1');
        $stmt->bindValue(':id', $baseId, PDO::PARAM_STR);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        $stmt = $db->prepare('SELECT * FROM papers WHERE id = :id AND deleted = 0 LIMIT 1');
        $stmt->bindValue(':id', $baseId, SQLITE3_TEXT);
        $result = $stmt->execute();
        $row = $result ? $result->fetchArray(SQLITE3_ASSOC) : false;
    }

    return mapPaperMetadataRow($row ?: null);
}

/**
 * Tokenize search text for safe FTS query construction.
 */
function tokenizeFtsText($text) {
    preg_match_all('/[\p{L}\p{N}_]+/u', mb_strtolower($text, 'UTF-8'), $matches);
    return array_values(array_filter($matches[0], function ($term) {
        return mb_strlen($term, 'UTF-8') >= 2;
    }));
}

/**
 * Append unquoted query text as FTS prefix terms.
 */
function appendFtsPrefixTerms(&$parts, $text, $maxParts) {
    foreach (tokenizeFtsText($text) as $term) {
        if (count($parts) >= $maxParts) {
            return;
        }
        $parts[] = $term . '*';
    }
}

/**
 * Tokenize a search query into safe FTS clauses.
 *
 * Unquoted terms use prefix matching for autocomplete. Quoted terms use exact
 * phrase matching, e.g. "attention is all" vaswani => "attention is all" vaswani*
 */
function buildFtsQuery($query) {
    $query = (string) $query;
    $parts = [];
    $maxParts = 8;
    $offset = 0;

    preg_match_all('/"([^"]+)"/u', $query, $matches, PREG_OFFSET_CAPTURE);
    foreach ($matches[0] as $index => $match) {
        if (count($parts) >= $maxParts) {
            break;
        }

        $matchText = $match[0];
        $matchOffset = $match[1];
        appendFtsPrefixTerms($parts, substr($query, $offset, $matchOffset - $offset), $maxParts);

        if (count($parts) < $maxParts) {
            $phraseText = $matches[1][$index][0];
            $phraseTerms = array_slice(tokenizeFtsText($phraseText), 0, 8);
            if ($phraseTerms !== []) {
                $parts[] = '"' . implode(' ', $phraseTerms) . '"';
            }
        }

        $offset = $matchOffset + strlen($matchText);
    }

    appendFtsPrefixTerms($parts, substr($query, $offset), $maxParts);

    return implode(' ', $parts);
}

/**
 * Avoid scanning the ID index for ordinary title/author text.
 */
function looksLikeArxivIdPrefix($query) {
    return preg_match('/^[0-9]{1,4}(?:\.[0-9]{0,5})?$/', $query) === 1
        || preg_match('/^[a-z-]+\/[0-9]*$/i', $query) === 1;
}

/**
 * Search metadata mirror for autocomplete suggestions.
 */
function searchPaperMetadata($query, $limit = 10) {
    $db = openMetadataDb();
    if (!$db) {
        return [];
    }

    $query = trim((string) $query);
    if ($query === '' || mb_strlen($query, 'UTF-8') < 2) {
        return [];
    }

    $limit = max(1, min(20, (int) $limit));
    $seen = [];
    $results = [];

    if (looksLikeArxivIdPrefix($query)) {
        if ($db instanceof PDO) {
            $idStmt = $db->prepare(
                'SELECT * FROM papers WHERE deleted = 0 AND id LIKE :idPrefix ORDER BY id LIMIT :limit'
            );
            $idStmt->bindValue(':idPrefix', $query . '%', PDO::PARAM_STR);
            $idStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $idStmt->execute();

            while ($row = $idStmt->fetch(PDO::FETCH_ASSOC)) {
                $metadata = mapPaperMetadataRow($row);
                if (!$metadata) {
                    continue;
                }
                $seen[$metadata['id']] = true;
                $results[] = $metadata;
            }
        } else {
            $idStmt = $db->prepare(
                'SELECT * FROM papers WHERE deleted = 0 AND id LIKE :idPrefix ORDER BY id LIMIT :limit'
            );
            $idStmt->bindValue(':idPrefix', $query . '%', SQLITE3_TEXT);
            $idStmt->bindValue(':limit', $limit, SQLITE3_INTEGER);
            $idResult = $idStmt->execute();

            while ($idResult && ($row = $idResult->fetchArray(SQLITE3_ASSOC))) {
                $metadata = mapPaperMetadataRow($row);
                if (!$metadata) {
                    continue;
                }
                $seen[$metadata['id']] = true;
                $results[] = $metadata;
            }
        }
    }

    $ftsQuery = buildFtsQuery($query);
    if ($ftsQuery !== '' && count($results) < $limit) {
        $remaining = $limit - count($results);
        $ftsSql = <<<'SQL'
SELECT p.*
FROM paper_fts f
JOIN papers p ON p.rowid = f.rowid
WHERE paper_fts MATCH :query AND p.deleted = 0
LIMIT :limit
SQL;

        try {
            if ($db instanceof PDO) {
                $ftsStmt = $db->prepare($ftsSql);
                $ftsStmt->bindValue(':query', $ftsQuery, PDO::PARAM_STR);
                $ftsStmt->bindValue(':limit', $remaining, PDO::PARAM_INT);
                $ftsStmt->execute();

                while ($row = $ftsStmt->fetch(PDO::FETCH_ASSOC)) {
                    $metadata = mapPaperMetadataRow($row);
                    if (!$metadata || isset($seen[$metadata['id']])) {
                        continue;
                    }
                    $seen[$metadata['id']] = true;
                    $results[] = $metadata;
                }
            } else {
                $ftsStmt = $db->prepare($ftsSql);
                $ftsStmt->bindValue(':query', $ftsQuery, SQLITE3_TEXT);
                $ftsStmt->bindValue(':limit', $remaining, SQLITE3_INTEGER);
                $ftsResult = $ftsStmt->execute();

                while ($ftsResult && ($row = $ftsResult->fetchArray(SQLITE3_ASSOC))) {
                    $metadata = mapPaperMetadataRow($row);
                    if (!$metadata || isset($seen[$metadata['id']])) {
                        continue;
                    }
                    $seen[$metadata['id']] = true;
                    $results[] = $metadata;
                }
            }
        } catch (Exception $e) {
            error_log('Metadata search failed: ' . $e->getMessage());
        }
    }

    return $results;
}

/**
 * Download file from URL with error handling
 */
function downloadFile($url, $destination) {
    $data = fetchText($url);
    if ($data === false) {
        return false;
    }
    return file_put_contents($destination, $data) !== false;
}

/**
 * Extract tar.gz file to a directory
 * Also handles plain gzip files (single file submissions)
 */
function extractTarGz($tarFile, $extractDir) {
    if (!file_exists($tarFile)) {
        return false;
    }

    // Create extraction directory
    if (!is_dir($extractDir)) {
        mkdir($extractDir, 0755, true);
    }

    // Use PharData to extract tar.gz
    try {
        $phar = new PharData($tarFile);
        $phar->extractTo($extractDir);
        return true;
    } catch (Exception $e) {
        // PharData failed - might be a plain gzip file (single file submission)
        // Try to decompress as plain gzip
        return extractPlainGzip($tarFile, $extractDir);
    }
}

/**
 * Extract a plain gzip file (not tar.gz) to a directory
 * arXiv serves single-file submissions as plain .gz files
 */
function extractPlainGzip($gzFile, $extractDir) {
    // Try to get the original filename from gzip header
    $originalName = getGzipOriginalName($gzFile);
    if (!$originalName) {
        // Fall back to main.tex if we can't determine the original name
        $originalName = 'main.tex';
    }

    // Create extraction directory if needed
    if (!is_dir($extractDir)) {
        mkdir($extractDir, 0755, true);
    }

    // Decompress the gzip file
    $gzHandle = gzopen($gzFile, 'rb');
    if (!$gzHandle) {
        return false;
    }

    $outputPath = $extractDir . '/' . $originalName;
    $outHandle = fopen($outputPath, 'wb');
    if (!$outHandle) {
        gzclose($gzHandle);
        return false;
    }

    while (!gzeof($gzHandle)) {
        $chunk = gzread($gzHandle, 8192);
        fwrite($outHandle, $chunk);
    }

    gzclose($gzHandle);
    fclose($outHandle);

    return file_exists($outputPath) && filesize($outputPath) > 0;
}

/**
 * Extract original filename from gzip header
 * Gzip format stores the original filename if FNAME flag is set
 */
function getGzipOriginalName($gzFile) {
    $handle = fopen($gzFile, 'rb');
    if (!$handle) {
        return null;
    }

    // Read gzip header (minimum 10 bytes)
    $header = fread($handle, 10);
    if (strlen($header) < 10) {
        fclose($handle);
        return null;
    }

    // Check gzip magic number (0x1f 0x8b)
    if (ord($header[0]) !== 0x1f || ord($header[1]) !== 0x8b) {
        fclose($handle);
        return null;
    }

    $flags = ord($header[3]);

    // FEXTRA (bit 2) - skip extra field if present
    if ($flags & 0x04) {
        $extraLen = unpack('v', fread($handle, 2))[1];
        fseek($handle, $extraLen, SEEK_CUR);
    }

    // FNAME (bit 3) - original filename is present
    if ($flags & 0x08) {
        $name = '';
        while (($char = fgetc($handle)) !== false && $char !== "\0") {
            $name .= $char;
        }
        fclose($handle);
        // Sanitize filename - only allow safe characters
        $name = basename($name);
        if (preg_match('/^[a-zA-Z0-9._-]+$/', $name)) {
            return $name;
        }
    }

    fclose($handle);
    return null;
}

/**
 * Create ZIP file from directory
 */
function createZipFromDirectory($sourceDir, $zipFile) {
    if (!extension_loaded('zip')) {
        return false;
    }

    $zip = new ZipArchive();
    if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        return false;
    }

    // Check if the extracted directory contains a single subdirectory
    // If so, use that as the source to avoid nested folder structure
    $items = array_values(array_diff(scandir($sourceDir), ['.', '..']));
    if (count($items) === 1 && is_dir($sourceDir . '/' . $items[0])) {
        $sourceDir = $sourceDir . '/' . $items[0];
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $file) {
        $filePath = $file->getRealPath();
        $relativePath = substr($filePath, strlen($sourceDir) + 1);

        if ($file->isDir()) {
            $zip->addEmptyDir($relativePath);
        } else {
            $zip->addFile($filePath, $relativePath);
        }
    }

    return $zip->close();
}

/**
 * Recursively delete directory and its contents
 */
function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }

    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        is_dir($path) ? deleteDirectory($path) : unlink($path);
    }
    rmdir($dir);
}

/**
 * Get cache directory path and ensure it exists
 */
function getCacheDir() {
    $cacheDir = __DIR__ . '/cache';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }
    return $cacheDir;
}

/**
 * Get cached file path for a given arXiv ID
 */
function getCachedFilePath($paperId) {
    $cacheDir = getCacheDir();
    $filename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
    return $cacheDir . '/' . $filename;
}

/**
 * Check if a cached file exists and is valid
 */
function isCacheValid($filePath) {
    return file_exists($filePath) && filesize($filePath) > 0;
}

/**
 * Manage cache size by keeping only the 100 most recent files
 */
function manageCacheSize() {
    $cacheDir = getCacheDir();
    $files = [];

    // Get all zip files in cache directory with their modification times
    if ($handle = opendir($cacheDir)) {
        while (false !== ($entry = readdir($handle))) {
            if (pathinfo($entry, PATHINFO_EXTENSION) === 'zip') {
                $filePath = $cacheDir . '/' . $entry;
                $files[] = [
                    'path' => $filePath,
                    'mtime' => filemtime($filePath)
                ];
            }
        }
        closedir($handle);
    }

    // Sort by modification time (newest first)
    usort($files, function($a, $b) {
        return $b['mtime'] - $a['mtime'];
    });

    // Delete files beyond the 100 most recent
    if (count($files) > 100) {
        for ($i = 100; $i < count($files); $i++) {
            unlink($files[$i]['path']);
        }
    }
}

/**
 * Global variable to track temp directories for cleanup
 */
$tempDirsToCleanup = [];

/**
 * Register shutdown function to ensure cleanup happens
 */
function registerCleanupHandler() {
    global $tempDirsToCleanup;
    register_shutdown_function(function() use (&$tempDirsToCleanup) {
        foreach ($tempDirsToCleanup as $tempDir) {
            cleanupTempFiles($tempDir);
        }
    });
}

/**
 * Add temp directory to cleanup list
 */
function addTempDirForCleanup($tempDir) {
    global $tempDirsToCleanup;
    $tempDirsToCleanup[] = $tempDir;
}

/**
 * Cleanup temporary files and directory
 */
function cleanupTempFiles($tempDir) {
    if (is_dir($tempDir)) {
        try {
            deleteDirectory($tempDir);
        } catch (Exception $e) {
            error_log("Failed to cleanup temp directory $tempDir: " . $e->getMessage());
        }
    }
}

/**
 * Clean up old temporary directories (older than 1 hour)
 */
function cleanupOldTempDirs() {
    $apiDir = __DIR__;
    $cutoffTime = time() - 3600; // 1 hour ago

    if ($handle = opendir($apiDir)) {
        while (false !== ($entry = readdir($handle))) {
            if (strpos($entry, 'temp_') === 0 && is_dir($apiDir . '/' . $entry)) {
                $dirPath = $apiDir . '/' . $entry;
                $dirTime = filemtime($dirPath);

                if ($dirTime < $cutoffTime) {
                    cleanupTempFiles($dirPath);
                }
            }
        }
        closedir($handle);
    }
}

/**
 * Serve file for download
 */
function serveFile($filePath, $filename, $contentType = 'application/zip') {
    if (!file_exists($filePath)) {
        http_response_code(404);
        die('File not found');
    }

    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: no-cache, must-revalidate');

    readfile($filePath);
    exit;
}

/**
 * Return JSON payload and terminate.
 */
function jsonResponse($statusCode, $payload) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Fetch and cache source ZIP for an arXiv ID.
 */
function getOrBuildSourceZip($paperId) {
    $cachedFilePath = getCachedFilePath($paperId);
    if (isCacheValid($cachedFilePath)) {
        touch($cachedFilePath);
        return $cachedFilePath;
    }

    $tempDir = __DIR__ . '/temp_' . uniqid();
    mkdir($tempDir, 0755, true);
    addTempDirForCleanup($tempDir);

    try {
        $sourceUrl = 'https://arxiv.org/src/' . $paperId;
        $tarFile = $tempDir . '/source.tar.gz';
        $extractDir = $tempDir . '/extracted';
        $tempZipFile = $tempDir . '/arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';

        if (!downloadFile($sourceUrl, $tarFile)) {
            throw new Exception('Could not download source file from arXiv');
        }

        if (!extractTarGz($tarFile, $extractDir)) {
            throw new Exception('Could not extract tar.gz file');
        }

        if (!createZipFromDirectory($extractDir, $tempZipFile)) {
            throw new Exception('Could not create ZIP file');
        }

        if (!rename($tempZipFile, $cachedFilePath)) {
            throw new Exception('Could not save file to cache');
        }

        manageCacheSize();
        return $cachedFilePath;
    } finally {
        cleanupTempFiles($tempDir);
    }
}

/**
 * Parse versions from the arXiv abs page submission-history block.
 */
function fetchSubmissionVersions($baseId) {
    $html = fetchText('https://arxiv.org/abs/' . $baseId);
    if ($html === false) {
        throw new Exception('Could not fetch arXiv abstract page');
    }

    if (!preg_match('/<div class="submission-history">(.*?)<\/div>/s', $html, $matches)) {
        throw new Exception('Submission history block not found');
    }

    $historyHtml = $matches[1];
    $versionPattern = '/<strong>\s*(?:<a[^>]*>)?\[v([0-9]+)\](?:<\/a>)?\s*<\/strong>\s*([^<]+?)\s*\(([^)]+)\)\s*<br\/?>/si';
    preg_match_all($versionPattern, $historyHtml, $allMatches, PREG_SET_ORDER);

    if (count($allMatches) === 0) {
        throw new Exception('No submission versions found in history');
    }

    $versions = [];
    foreach ($allMatches as $match) {
        $version = (int) $match[1];
        $submittedUtc = trim(html_entity_decode($match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $sizeLabel = trim(html_entity_decode($match[3], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $versions[$version] = [
            'version' => $version,
            'id' => $baseId . 'v' . $version,
            'submittedUtc' => $submittedUtc,
            'sizeLabel' => $sizeLabel,
        ];
    }

    ksort($versions, SORT_NUMERIC);
    $orderedVersions = array_values($versions);

    return [
        'versions' => $orderedVersions,
        'latestVersion' => $orderedVersions[count($orderedVersions) - 1]['version'],
    ];
}

/**
 * Parse title from abs page for metadata payload.
 */
function fetchPaperTitle($id) {
    $html = fetchText('https://arxiv.org/abs/' . $id);
    if ($html === false) {
        return null;
    }

    if (preg_match('/<title>\s*\[[^\]]+\]\s*(.*?)<\/title>/si', $html, $matches)) {
        return trim(html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
    return null;
}

/**
 * Resolve id/url from request parameters.
 */
function resolveArxivInput($preferredKey = 'id') {
    $raw = $_GET[$preferredKey] ?? '';
    if ($raw === '' && $preferredKey !== 'url') {
        $raw = $_GET['url'] ?? '';
    }
    return $raw;
}

// Main execution
try {
    registerCleanupHandler();
    cleanupOldTempDirs();

    $action = $_GET['action'] ?? '';

    // Legacy behavior: no action means source download from ?url=
    if ($action === '') {
        $arxivInput = $_GET['url'] ?? '';
        if (empty($arxivInput)) {
            http_response_code(400);
            die('Error: No arXiv URL or ID provided. Usage: ?url=https://arxiv.org/abs/1706.03762 or ?url=1706.03762');
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            http_response_code(400);
            die('Error: Invalid arXiv URL or ID format');
        }

        $paperId = $normalized['id'];
        $cachedFilePath = getOrBuildSourceZip($paperId);
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
    }

    if ($action === 'source') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $paperId = $normalized['id'];
        $cachedFilePath = getOrBuildSourceZip($paperId);
        $zipFilename = 'arxiv_' . str_replace(['/', '.'], '_', $paperId) . '_source.zip';
        serveFile($cachedFilePath, $zipFilename);
    }

    if ($action === 'versions') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $baseId = $normalized['baseId'];
        $result = fetchSubmissionVersions($baseId);
        jsonResponse(200, [
            'ok' => true,
            'baseId' => $baseId,
            'versions' => $result['versions'],
            'latestVersion' => $result['latestVersion'],
        ]);
    }

    if ($action === 'meta') {
        $arxivInput = resolveArxivInput('id');
        if (empty($arxivInput)) {
            jsonResponse(400, ['ok' => false, 'error' => 'Missing id parameter']);
        }

        $normalized = normalizeArxivId($arxivInput);
        if (!$normalized) {
            jsonResponse(400, ['ok' => false, 'error' => 'Invalid arXiv URL or ID format']);
        }

        $metadata = lookupPaperMetadata($normalized['baseId']);
        $title = $metadata['title'] ?? fetchPaperTitle($normalized['id']);
        jsonResponse(200, [
            'ok' => true,
            'id' => $normalized['id'],
            'baseId' => $normalized['baseId'],
            'version' => $normalized['version'],
            'metadata' => $metadata,
            'title' => $title,
        ]);
    }

    if ($action === 'search') {
        $query = $_GET['q'] ?? '';
        $limit = $_GET['limit'] ?? 10;
        jsonResponse(200, [
            'ok' => true,
            'query' => (string) $query,
            'results' => searchPaperMetadata($query, $limit),
        ]);
    }

    jsonResponse(400, ['ok' => false, 'error' => 'Unsupported action']);
} catch (Exception $e) {
    jsonResponse(500, ['ok' => false, 'error' => $e->getMessage()]);
}
